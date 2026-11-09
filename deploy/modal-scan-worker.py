"""Lattency scan worker on Modal — serverless GPU pipeline for venue scans.

Two functions, deliberately split so GPU billing only happens during a job:

  api      CPU-only web endpoint (scales to ~zero). Implements the same
           contract as scripts/scan-worker.ts: GET /health, POST /run
           {scan_id} with x-scan-worker-key auth. On a valid /run it spawns
           run_scan and returns 202 immediately.

  run_scan GPU function (L4). One container per scan — Modal queues extra
           spawns behind max_containers=1, which preserves the worker's
           one-job-at-a-time semantics. Runs the exact same code path as
           `pnpm scan-worker --once <scan_id>`.

Deploy:
    modal secret create lattency-scan-worker \
        SCAN_WORKER_KEY=... BLOB_READ_WRITE_TOKEN=... \
        APP_URL=https://lattency.vercel.app
    modal deploy modal-scan-worker.py

Then set on Vercel:
    SCAN_WORKER_URL=https://<workspace>--lattency-scan-worker-api.modal.run/run

Image contents (license-clean pipeline, docs/venue-3d-insights.md):
    deface (pip) → COLMAP 4.x (conda-forge) → gsplat 1.5.3 (PyPI wheel,
    CUDA) + matching v1.5.3 example sources → spz ply_to_spz (cmake).
    Node worker: tsx + @vercel/blob + the three source files it imports.
"""

import hmac
import json
import os
import re
import subprocess

import modal

APP_NAME = "lattency-scan-worker"
SCAN_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
MAX_BODY = 16 * 1024

app = modal.App(APP_NAME)
secrets = [modal.Secret.from_name("lattency-scan-worker")]

# --------------------------------------------------------------------------
# Images
# --------------------------------------------------------------------------

# Tiny CPU image for the HTTP front door — cold starts stay fast.
api_image = modal.Image.debian_slim(python_version="3.11")

# Full toolchain + Node worker. Heavy (~10 GB with CUDA torch) but Modal
# caches layers; only built once per change.
worker_image = (
    modal.Image.from_registry("node:22-bookworm", add_python="3.11")
    .apt_install(
        "git",
        "curl",
        "cmake",
        "build-essential",
        "libgl1",
        "libglib2.0-0",
    )
    .run_commands(
        # micromamba → conda-forge COLMAP (no good apt/pip CLI equivalent)
        "curl -Ls https://micro.mamba.pm/api/micromamba/linux-64/latest"
        " | tar -xvj bin/micromamba",
        "mv bin/micromamba /usr/local/bin/micromamba",
        "micromamba create -y -p /opt/colmap-env -c conda-forge colmap",
        # Python ML stack. torch from PyPI ships CUDA wheels on linux;
        # gsplat 1.5.3 wheel carries the prebuilt CUDA rasterizer.
        "pip install --no-cache-dir"
        " torch gsplat==1.5.3 deface onnx onnxruntime tyro viser"
        " nerfview splines pycolmap torchmetrics"
        " opencv-python-headless imageio pyyaml tqdm tensorboard",
        # Example/trainer sources pinned to the wheel's release — repo main
        # imports gsplat.color_correct/losses, which no released wheel has.
        "git clone --depth 1 --branch v1.5.3"
        " https://github.com/nerfstudio-project/gsplat /opt/gsplat-src",
        # Niantic SPZ — no release binaries, build ply_to_spz from source.
        "git clone --depth 1 https://github.com/nianticlabs/spz /opt/spz-src",
        "cmake -S /opt/spz-src -B /opt/spz-src/build -DCMAKE_BUILD_TYPE=Release",
        "cmake --build /opt/spz-src/build -j$(nproc)",
        "test -x /opt/spz-src/build/ply_to_spz",
        "mkdir -p /opt/scan-tools/bin",
    )
    .add_local_dir("deploy/modal/bin", "/opt/scan-tools/bin-src", copy=True)
    .add_local_dir(
        ".",
        "/repo",
        copy=True,
        ignore=[
            ".git",
            "node_modules",
            ".next",
            ".vercel",
            ".env",
            ".env.local",
            ".env.*.local",
            "coverage",
            "dist",
            "*.tsbuildinfo",
        ],
    )
    .run_commands(
        # Bake the real deface entrypoint into the wrapper, then install all
        # wrappers where the worker's PATH lookup finds them first.
        'REAL=$(command -v deface) && test -n "$REAL"'
        ' && sed "s|@DEFACE_REAL@|$REAL|g"'
        " /opt/scan-tools/bin-src/deface"
        " > /opt/scan-tools/bin/deface",
        "cp /opt/scan-tools/bin-src/colmap /opt/scan-tools/bin/colmap",
        "cp /opt/scan-tools/bin-src/gsplat /opt/scan-tools/bin/gsplat",
        "cp /opt/scan-tools/bin-src/spz-convert /opt/scan-tools/bin/spz-convert",
        "chmod +x /opt/scan-tools/bin/*",
        # Minimal Node package — only what scripts/scan-worker.ts imports.
        "mkdir -p /app/scripts /app/lib /app/base44/shared",
        "cp /repo/scripts/scan-worker.ts /app/scripts/scan-worker.ts",
        "cp /repo/lib/scan-blob.ts /app/lib/scan-blob.ts",
        "cp /repo/base44/shared/gateway-auth.ts"
        " /app/base44/shared/gateway-auth.ts",
        "cat > /app/package.json <<'PKG'\n"
        '{"name":"lattency-scan-worker","private":true,'
        '"dependencies":{"@vercel/blob":"2.8.2","server-only":"0.0.1",'
        '"tsx":"4.22.4"}}\nPKG',
        "cd /app && npm install --no-audit --no-fund",
    )
)


# --------------------------------------------------------------------------
# API front door — same contract as scripts/scan-worker.ts
# --------------------------------------------------------------------------


@app.function(image=api_image, secrets=secrets)
@modal.asgi_app(requires_proxy_auth=False)
def api():
    """ASGI (not web_server): Modal's web_server endpoints answer every
    request with a 303 attempt-token redirect, which breaks non-GET calls
    from server-to-server clients. asgi_app proxies HTTP natively."""
    worker_key = os.environ.get("SCAN_WORKER_KEY", "")

    async def asgi(scope, receive, send):
        if scope["type"] != "http":
            return
        method = scope["method"]
        path = scope["path"]

        async def respond(code: int, obj: dict) -> None:
            payload = json.dumps(obj).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": code,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"cache-control", b"no-store"),
                        (b"content-length", str(len(payload)).encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": payload})

        if method == "GET" and path == "/health":
            return await respond(200, {"ok": True, "busy": False})
        if not (method == "POST" and path == "/run"):
            return await respond(404, {"error": "not found"})

        # Same semantics as authorizeGateway: unconfigured → 503,
        # missing/wrong → 401. compare_digest keeps it constant-time.
        if len(worker_key) < 32:
            return await respond(503, {"error": "Contribution gateway unavailable"})
        headers = {k.lower(): v for k, v in scope.get("headers", [])}
        supplied = headers.get(b"x-scan-worker-key", b"").decode("utf-8", "replace")
        if not supplied or not hmac.compare_digest(supplied, worker_key):
            return await respond(401, {"error": "Unauthorized"})

        try:
            length = int(headers.get(b"content-length", b"0") or b"0")
        except ValueError:
            length = MAX_BODY + 1
        if length > MAX_BODY:
            return await respond(400, {"error": "body too large"})
        chunks = []
        size = 0
        while True:
            msg = await receive()
            if msg["type"] != "http.request":
                break
            chunk = msg.get("body", b"")
            size += len(chunk)
            if size > MAX_BODY:
                return await respond(400, {"error": "body too large"})
            chunks.append(chunk)
            if not msg.get("more_body"):
                break
        try:
            body = json.loads(b"".join(chunks) or b"{}")
        except Exception:
            return await respond(400, {"error": "body must be JSON"})
        if not isinstance(body, dict):
            return await respond(400, {"error": "body must be an object"})
        scan_id = body.get("scan_id")
        if not isinstance(scan_id, str) or not SCAN_ID_RE.match(scan_id):
            return await respond(400, {"error": "scan_id required"})

        # Queue the GPU job — max_containers=1 serializes actual work.
        await modal.Function.from_name(APP_NAME, "run_scan").spawn.aio(scan_id)
        return await respond(202, {"accepted": True, "scan_id": scan_id})

    return asgi


# --------------------------------------------------------------------------
# GPU job — one container per scan, runs `scan-worker --once <scan_id>`
# --------------------------------------------------------------------------


@app.function(
    image=worker_image,
    # T4 over L4: L4 capacity was constrained at deploy time and T4 is
    # cheaper; gsplat on a few hundred keyframes doesn't need more.
    gpu="T4",
    secrets=secrets,
    timeout=4 * 3600,
    max_containers=1,
    cpu=8,
    memory=32768,
)
def run_scan(scan_id: str) -> None:
    env = dict(os.environ)
    env["PATH"] = "/opt/scan-tools/bin:" + env.get("PATH", "")
    env["APP_URL"] = env.get("APP_URL", "https://lattency.vercel.app")
    env.setdefault("WORK_DIR", "/tmp/lattency-scans")
    env.setdefault("PORT", "8787")
    subprocess.run(
        [
            "/app/node_modules/.bin/tsx",
            "--conditions=react-server",
            "/app/scripts/scan-worker.ts",
            "--once",
            scan_id,
        ],
        cwd="/app",
        env=env,
        check=True,
    )
