// Reference scan worker — the deployable daemon behind SCAN_WORKER_URL
// (docs/venue-3d-ux-research.md §7). Minimal node:http server, no deps,
// meant to run on a GPU box next to the reconstruction toolchain.
//
// Contract (the same one POST /api/venue-scans/:id/process enqueues into):
//
//   GET  /health          → { ok, busy } — liveness, unauthenticated
//   POST /run {scan_id}   → 202 { accepted: true } — starts the pipeline
//                           async; 409 { error: "busy" } while a job runs
//
// Auth: x-scan-worker-key vs SCAN_WORKER_KEY (≥32 chars), constant-time —
// the same base44/shared/gateway-auth.ts helper the app route uses.
//
// Job: download the scan's frames from Vercel Blob → deface (patron blur,
// BEFORE reconstruction — the publish attestation rides on this step) →
// COLMAP SfM → gsplat train → SPZ export → upload final-splat.spz via
// putScanArtifact → drive preview → refining → published through the
// worker-keyed process route on APP_URL. Any failure marks the scan
// `rejected` and logs the error here — stderr never leaves in an HTTP
// response.
//
// Required env:
//   SCAN_WORKER_KEY        ≥32-char worker secret (same value as Vercel's)
//   APP_URL                the app's base URL for status callbacks
//   BLOB_READ_WRITE_TOKEN  Vercel Blob token — reads scans/{id}/*.jpg,
//                          writes scans/{id}/artifacts/*
//
// Optional env:
//   PORT        listen port (default 8787)
//   WORK_DIR    scratch root (default: fresh temp dir per job)
//   DEFACE_BIN  deface binary (default "deface") — pip install deface
//   COLMAP_BIN  colmap binary (default "colmap")
//   GSPLAT_BIN  trainer entrypoint (default "gsplat") — any executable
//               taking --data_dir/--result_dir/--max_steps; wrap
//               examples/simple_trainer.py in a small script if needed
//   SPZ_BIN     spz-convert binary (default "spz-convert")
//
// Then point the app at it: SCAN_WORKER_URL=http://<host>:8787/run

import { execFile } from "node:child_process";

// Same convention as scripts/verify-testnet-funding.ts — `pnpm scan-worker`
// picks up .env.local without the operator exporting vars by hand.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Optional — a hosted worker gets env from its platform instead.
}
import { mkdirSync, mkdtempSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { get } from "@vercel/blob";
import { authorizeGateway } from "../base44/shared/gateway-auth";
import { listScanFrames, putScanArtifact } from "../lib/scan-blob";

// Same shape lib/scan-blob.ts enforces — kept inline because that regex
// isn't exported and this daemon must not widen it.
const SCAN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_BODY = 16 * 1024;

export interface ScanWorkerConfig {
  port: number;
  /** ≥32-char shared secret; authorizeGateway 503s when unset/short. */
  workerKey: string | undefined;
  /** App base URL for status callbacks (no trailing slash). */
  appUrl: string | undefined;
  /** Scratch root — a per-scan subdir is created inside it. */
  workDir: string | undefined;
  defaceBin: string;
  colmapBin: string;
  gsplatBin: string;
  spzBin: string;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ScanWorkerConfig {
  return {
    port: Number(env.PORT) || 8787,
    workerKey: env.SCAN_WORKER_KEY,
    appUrl: env.APP_URL?.replace(/\/+$/, "") || undefined,
    workDir: env.WORK_DIR,
    defaceBin: env.DEFACE_BIN ?? "deface",
    colmapBin: env.COLMAP_BIN ?? "colmap",
    gsplatBin: env.GSPLAT_BIN ?? "gsplat",
    spzBin: env.SPZ_BIN ?? "spz-convert",
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(payload);
}

/** Forward a web-standard Response (the auth helper's) onto node:http. */
async function sendWebResponse(res: ServerResponse, r: Response): Promise<void> {
  res.writeHead(r.status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(await r.text());
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/** One status transition through the app's worker-keyed process route. */
async function postStatus(
  appUrl: string,
  workerKey: string,
  scanId: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${appUrl}/api/venue-scans/${scanId}/process`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-scan-worker-key": workerKey,
    },
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON error body */
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

/** Derive the blob pathname from a stored frame URL (leading slash off). */
function pathnameFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  return pathname.startsWith("/") ? pathname.slice(1) : pathname;
}

/** Run one pipeline tool; ENOENT gets an install hint, exit failures carry
 *  only a trimmed stderr tail (logged here, never in an HTTP response). */
function runTool(bin: string, args: string[], hint: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(bin, args, { maxBuffer: 64 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (!error) return resolvePromise();
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return rejectPromise(new Error(`tool not found: ${bin} — ${hint}`));
      }
      const tail = typeof stderr === "string" ? stderr.trim().slice(-500) : "";
      return rejectPromise(
        new Error(
          `${bin} exited (${error.code ?? error.signal ?? "unknown"})` +
            (tail ? ` — ${tail}` : ""),
        ),
      );
    });
  });
}

/** Run one scan through the full pipeline. Shared by the HTTP server's
 *  /run handler and the `--once <scan_id>` CLI mode (used by the Modal
 *  GPU function, which spawns one container per scan instead of hosting
 *  a permanent worker). */
export async function runScanJob(
  cfg: ScanWorkerConfig,
  scanId: string,
): Promise<void> {
  const workerKey = cfg.workerKey ?? "";
  const jobErr = async (err: unknown): Promise<void> => {
      // The scan fails closed to `rejected`; the cause stays in worker logs.
      console.error(
        `scan-worker [${scanId}] job failed:`,
        err instanceof Error ? err.message : err,
      );
      if (!cfg.appUrl) return;
      try {
        await postStatus(cfg.appUrl, workerKey, scanId, { status: "rejected" });
        console.log(`scan-worker [${scanId}] → rejected`);
      } catch (e) {
        console.error(
          `scan-worker [${scanId}] rejected-transition failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    };

    try {
      if (!cfg.appUrl) throw new Error("APP_URL is not set");
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set");
      const appUrl = cfg.appUrl;

      // The enqueue path already moved the scan to `processing`; this kick
      // covers direct /run calls. A 409 means it's further along (resumed).
      const kick = await postStatus(appUrl, workerKey, scanId, {
        status: "processing",
      });
      if (kick.status === 404) {
        console.error(`scan-worker [${scanId}] not found — nothing to reject`);
        return;
      }
      if (!kick.ok && kick.status !== 409)
        throw new Error(`processing transition failed: HTTP ${kick.status}`);

      // Pull the stored frames.
      const dir = cfg.workDir
        ? join(cfg.workDir, `scan-${scanId}`)
        : mkdtempSync(join(tmpdir(), `lattency-scan-${scanId}-`));
      const framesDir = join(dir, "frames");
      const blurredDir = join(dir, "blurred");
      mkdirSync(framesDir, { recursive: true });

      const frameUrls = await listScanFrames(scanId);
      if (frameUrls.length === 0)
        throw new Error("no frames stored for this scan");
      console.log(`scan-worker [${scanId}] downloading ${frameUrls.length} frames`);
      for (let i = 0; i < frameUrls.length; i++) {
        const url = frameUrls[i];
        const seqMatch = /\/(\d+)\.jpg$/.exec(new URL(url).pathname);
        const name = `${(seqMatch?.[1] ?? String(i)).padStart(5, "0")}.jpg`;
        const result = await get(pathnameFromUrl(url), {
          access: "private",
          token,
        });
        if (!result || result.statusCode !== 200 || !result.stream)
          throw new Error(`frame download failed for ${url}`);
        await writeFile(
          join(framesDir, name),
          Buffer.from(await new Response(result.stream).arrayBuffer()),
        );
      }

      // The license-clean spine (docs/venue-3d-insights.md). deface runs
      // FIRST — frames that reach reconstruction are already blurred, which
      // is what blur_verified attests at publish.
      await runTool(
        cfg.defaceBin,
        [framesDir, "-o", blurredDir, "--thresh", "0.2"],
        "pip install deface (https://github.com/ORB-HD/deface)",
      );
      await runTool(
        cfg.colmapBin,
        [
          "automatic_reconstructor",
          "--workspace_path",
          join(blurredDir, "colmap"),
          "--image_path",
          blurredDir,
          "--quality",
          "medium",
        ],
        "install COLMAP (https://colmap.github.io)",
      );
      await runTool(
        cfg.gsplatBin,
        [
          "--data_dir",
          join(blurredDir, "colmap"),
          "--result_dir",
          join(blurredDir, "out"),
          "--max_steps",
          "7000",
        ],
        "pip install gsplat (https://github.com/nerfstudio-project/gsplat)",
      );
      const spzPath = join(dir, "final-splat.spz");
      await runTool(
        cfg.spzBin,
        [join(blurredDir, "out", "splat.ply"), "-o", spzPath],
        "build spz (https://github.com/nianticlabs/spz)",
      );

      // Store before any transition — a failed upload can't publish a scan
      // pointing at nothing.
      const artifact = await putScanArtifact(
        scanId,
        "final-splat.spz",
        await readFile(spzPath),
      );

      // Drive the publish chain; 409 = already past (resumed run).
      const chain: Record<string, unknown>[] = [
        { status: "preview" },
        { status: "refining" },
        {
          status: "published",
          splat_url: artifact.url,
          blur_verified: true,
        },
      ];
      for (const step of chain) {
        const res = await postStatus(appUrl, workerKey, scanId, step);
        if (!res.ok && res.status !== 409)
          throw new Error(`transition to ${step.status} failed: HTTP ${res.status}`);
      }
      console.log(`scan-worker [${scanId}] published — ${artifact.url}`);
    } catch (err) {
      await jobErr(err);
    }
}

export function createScanWorker(cfg: ScanWorkerConfig): {
  server: Server;
  isBusy: () => boolean;
} {
  let busy = false;

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, busy });
    }

    if (req.method === "POST" && url.pathname === "/run") {
      // Auth on the shared helper — same constant-time compare the app's
      // process route performs. Key unset → 503; wrong/missing → 401.
      const key = req.headers["x-scan-worker-key"];
      const authReq = new Request("http://scan-worker/run", {
        method: "POST",
        headers: typeof key === "string" ? { "x-scan-worker-key": key } : {},
      });
      const unauthorized = await authorizeGateway(
        authReq,
        cfg.workerKey,
        "x-scan-worker-key",
      );
      if (unauthorized) return sendWebResponse(res, unauthorized);

      let body: unknown;
      try {
        const raw = await readBody(req);
        try {
          body = JSON.parse(raw.toString("utf8"));
        } catch {
          return sendJson(res, 400, { error: "body must be JSON" });
        }
      } catch (e) {
        return sendJson(res, (e as { status?: number })?.status ?? 400, {
          error: "body too large",
        });
      }
      if (body === null || typeof body !== "object" || Array.isArray(body))
        return sendJson(res, 400, { error: "body must be an object" });
      const scanId = (body as Record<string, unknown>).scan_id;
      if (typeof scanId !== "string" || !SCAN_ID_RE.test(scanId))
        return sendJson(res, 400, { error: "scan_id required" });

      // One job at a time — GPU memory is the constraint, not the queue.
      if (busy) return sendJson(res, 409, { error: "busy" });
      busy = true;
      sendJson(res, 202, { accepted: true, scan_id: scanId });
      void runScanJob(cfg, scanId).finally(() => {
        busy = false;
      });
      return;
    }

    return sendJson(res, 404, { error: "not found" });
  }

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error("scan-worker request error:", err instanceof Error ? err.message : err);
      if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      else res.end();
    });
  });

  return { server, isBusy: () => busy };
}

// Auto-listen only when run directly — tests import createScanWorker.
const invokedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const cfg = configFromEnv();
  // `--once <scan_id>` runs a single job and exits — the entrypoint the
  // Modal GPU function uses (one container per scan, no always-on server).
  const onceIdx = process.argv.indexOf("--once");
  if (onceIdx !== -1) {
    const scanId = process.argv[onceIdx + 1];
    if (!scanId || !SCAN_ID_RE.test(scanId)) {
      console.error("usage: scan-worker --once <scan_id>");
      process.exit(2);
    }
    runScanJob(cfg, scanId)
      .then(() => process.exit(0))
      .catch((err) => {
        console.error("scan-worker --once failed:", err instanceof Error ? err.message : err);
        process.exit(1);
      });
  } else {
    const { server } = createScanWorker(cfg);
    server.listen(cfg.port, () => {
      console.log(
        `scan-worker listening on :${cfg.port} — POST /run {scan_id}, GET /health`,
      );
      if (!cfg.workerKey || cfg.workerKey.length < 32)
        console.warn("SCAN_WORKER_KEY unset/short — /run will answer 503 until configured");
      if (!cfg.appUrl) console.warn("APP_URL unset — jobs will fail before they start");
    });
  }
}
