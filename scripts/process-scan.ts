// Operator tool — manual/pilot processing for a venue scan (Phase 1 infra,
// docs/venue-3d-ux-research.md §7). This is NOT a GPU worker; it is the
// worker-side contract a real worker will later consume: pull the stored
// frames, run the documented blur→COLMAP→gsplat→SPZ pipeline yourself,
// then drive the status transitions a worker is trusted to make.
//
// Usage:
//   pnpm process-scan --scan-id <id> [--app-url <url>] [--dir <path>]
//                      [--splat <file> --blur-verified] [--reject] [--yes]
//
//   --scan-id       VenueScan id (required)
//   --app-url       Base URL of the Next app (default $APP_URL or
//                   http://localhost:3000 — dev servers run on random ports,
//                   so pass the actual port)
//   --dir           Working dir for frames (default: a fresh temp dir)
//   --splat <file>  Final .spz output to publish — uploads it as a scan
//                   artifact, then drives preview → refining → published
//   --blur-verified REQUIRED with --splat: operator affirms every patron
//                   face in the frames was blurred BEFORE reconstruction
//   --reject        Mark the scan rejected instead of downloading frames
//   --yes           Skip the interactive confirmation prompt
//   --help          Show this help
//
// Required env:
//   BLOB_READ_WRITE_TOKEN  Vercel Blob token — reads/writes scans/{id}/…
//   SCAN_WORKER_KEY        ≥32-char worker secret, sent as x-scan-worker-key
//                          to POST /api/venue-scans/:id/process
//
// The `server-only` marker in lib/scan-blob.ts resolves to a throwing stub
// under plain node — the `pnpm process-scan` script passes
// `--conditions=react-server`, which resolves it to the empty export. If
// you invoke tsx directly, keep that flag.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { get } from "@vercel/blob";

interface Args {
  scanId?: string;
  appUrl: string;
  dir?: string;
  splat?: string;
  blurVerified: boolean;
  reject: boolean;
  yes: boolean;
  help: boolean;
}

const HELP = `pnpm process-scan --scan-id <id> [--app-url <url>] [--dir <path>]
                   [--splat <file> --blur-verified] [--reject] [--yes]

Pulls a scan's stored frames, prints the documented pipeline commands,
and drives operator-trusted status transitions via the worker key.

Options:
  --scan-id <id>        VenueScan id (required)
  --app-url <url>       Next app base URL (default $APP_URL or http://localhost:3000)
  --dir <path>          Working dir for frames (default: fresh temp dir)
  --splat <file>        Final .spz to publish (uploads artifact + publishes)
  --blur-verified       Required with --splat — affirms faces were blurred
  --reject              Mark the scan rejected
  --yes                 Skip the confirmation prompt
  --help                Show this help

Env required: BLOB_READ_WRITE_TOKEN, SCAN_WORKER_KEY (>=32 chars)`;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    blurVerified: false,
    reject: false,
    yes: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--scan-id") args.scanId = next();
    else if (a === "--app-url") args.appUrl = next();
    else if (a === "--dir") args.dir = next();
    else if (a === "--splat") args.splat = next();
    else if (a === "--blur-verified") args.blurVerified = true;
    else if (a === "--reject") args.reject = true;
    else if (a === "--yes" || a === "-y") args.yes = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else fail(`unknown argument: ${a}`);
  }
  return args;
}

function fail(message: string): never {
  console.error(`process-scan: ${message}`);
  process.exit(1);
}

/** One operator-trusted status transition via the app route. */
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

async function confirmOrExit(args: Args, prompt: string): Promise<void> {
  if (args.yes) return;
  if (!process.stdin.isTTY) {
    console.log(`${prompt} (non-interactive — proceeding)`);
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${prompt} [y/N] `);
  rl.close();
  if (answer.trim().toLowerCase() !== "y") fail("aborted by operator");
}

function printPipelineRecipe(framesDir: string, blurredDir: string): void {
  // The documented license-clean spine (docs/venue-3d-insights.md):
  // deface → COLMAP → gsplat → SPZ. No non-commercial code anywhere in it.
  // Command shapes are the honest recipe — versions/images are the
  // operator's to pin when the GPU worker lands.
  console.log(`
Pipeline recipe (run on a GPU host — self-host stays the default):

  # 1. Blur patrons BEFORE reconstruction — hard requirement for publish
  #    (deface, MIT: https://github.com/ORB-HD/deface)
  pip install deface
  deface "${framesDir}" -o "${blurredDir}" --thresh 0.2
  #    Review the blurred output by eye before continuing — the
  #    blur_verified flag you set later attests to this step.

  # 2. Pose registration — COLMAP (bounded validation: a capture that
  #    fails registration dies here, not after an hour of training)
  colmap automatic_reconstructor \\
      --workspace_path "${blurredDir}/colmap" \\
      --image_path "${blurredDir}" \\
      --quality medium

  # 3. Train — gsplat (Apache-2.0)
  #    https://github.com/nerfstudio-project/gsplat
  python examples/simple_trainer.py default \\
      --data_dir "${blurredDir}/colmap" \\
      --result_dir "${blurredDir}/out" \\
      --max_steps 7000

  # 4. Compress — SPZ (Niantic, ~90% smaller than PLY)
  #    https://github.com/nianticlabs/spz
  spz-convert "${blurredDir}/out/splat.ply" -o final-splat.spz

Then publish:
  pnpm process-scan --scan-id <id> --app-url <url> \\
      --splat ./final-splat.spz --blur-verified --yes
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.scanId) fail("--scan-id is required (try --help)");
  if (args.splat && !args.blurVerified)
    fail("--splat requires --blur-verified — publish needs the blur attestation");
  if (args.reject && args.splat)
    fail("--reject and --splat are mutually exclusive");

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) fail("BLOB_READ_WRITE_TOKEN is not set");
  const workerKey = process.env.SCAN_WORKER_KEY;
  if (!workerKey || workerKey.length < 32)
    fail("SCAN_WORKER_KEY is not set (or shorter than 32 chars)");

  // Lazy-loaded so we can print a real hint when the marker resolves to the
  // throwing client bundle.
  let scanBlob: typeof import("../lib/scan-blob");
  try {
    scanBlob = await import("../lib/scan-blob");
  } catch {
    fail(
      "lib/scan-blob failed to load — run via `pnpm process-scan` (which " +
        "passes --conditions=react-server) or add the flag to your tsx call",
    );
  }

  const scanId = args.scanId;
  const appUrl = args.appUrl.replace(/\/+$/, "");

  if (args.reject) {
    const res = await postStatus(appUrl, workerKey, scanId, {
      status: "rejected",
    });
    if (!res.ok)
      fail(`reject failed: HTTP ${res.status} ${JSON.stringify(res.body)}`);
    console.log(`scan ${scanId} → rejected`);
    return;
  }

  // Kick the scan into the pipeline. A 409 means it is already past
  // `captured` — tolerated, since this tool also resumes a half-run job.
  const kick = await postStatus(appUrl, workerKey, scanId, {
    status: "processing",
  });
  if (kick.status === 401) fail("worker key rejected (401)");
  if (kick.status === 404) fail(`scan ${scanId} not found (404)`);
  if (!kick.ok && kick.status !== 409)
    fail(`processing transition failed: HTTP ${kick.status} ${JSON.stringify(kick.body)}`);
  console.log(
    kick.ok
      ? `scan ${scanId} → processing`
      : `scan ${scanId} already past captured — resuming`,
  );

  // Pull the stored frames.
  const dir = args.dir ?? mkdtempSync(join(tmpdir(), `lattency-scan-${scanId}-`));
  const framesDir = join(dir, "frames");
  const blurredDir = join(dir, "blurred");
  mkdirSync(framesDir, { recursive: true });

  const frameUrls = await scanBlob.listScanFrames(scanId);
  if (frameUrls.length === 0)
    fail(`no frames stored for scan ${scanId} — nothing to process`);
  console.log(`downloading ${frameUrls.length} frames → ${framesDir}`);
  for (let i = 0; i < frameUrls.length; i++) {
    const url = frameUrls[i];
    const seqMatch = /\/(\d+)\.jpg$/.exec(new URL(url).pathname);
    const name = `${(seqMatch?.[1] ?? String(i)).padStart(5, "0")}.jpg`;
    const result = await get(pathnameFromUrl(url), {
      access: "private",
      token,
    });
    if (!result || result.statusCode !== 200 || !result.stream)
      fail(`frame download failed for ${url}`);
    const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
    writeFileSync(join(framesDir, name), bytes);
  }
  console.log(`${frameUrls.length} frames written`);

  printPipelineRecipe(framesDir, blurredDir);

  if (!args.splat) {
    console.log(
      "Done — re-invoke with --splat <file> --blur-verified once outputs are ready.",
    );
    return;
  }

  // Publish path — the artifact upload happens before any transition so a
  // failed store can't publish a scan pointing at nothing.
  if (!existsSync(args.splat)) fail(`splat file not found: ${args.splat}`);
  await confirmOrExit(
    args,
    `Publish ${basename(args.splat)} for scan ${scanId} with blur_verified=true?`,
  );

  const artifact = await scanBlob.putScanArtifact(
    scanId,
    "final-splat.spz",
    readFileSync(args.splat),
  );
  console.log(`artifact stored: ${artifact.url}`);

  // Drive the publish chain. Each transition is attempted in order; a 409
  // means the scan is already at/past that step (resumed run), anything
  // else hard-fails. `published` carries splat_url + blur_verified — the
  // gateway re-verifies both before writing.
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
    if (res.ok) {
      console.log(`scan ${scanId} → ${step.status}`);
      continue;
    }
    if (res.status === 409) {
      console.log(`scan ${scanId}: ${step.status} skipped (already past)`);
      continue;
    }
    fail(
      `transition to ${step.status} failed: HTTP ${res.status} ` +
        `${JSON.stringify(res.body)}`,
    );
  }
  console.log(`scan ${scanId} published — splat ${artifact.url}`);
}

main().catch((err) => {
  console.error("process-scan:", err instanceof Error ? err.message : err);
  process.exit(1);
});
