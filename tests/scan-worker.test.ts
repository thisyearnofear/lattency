import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// The worker shells out to the GPU toolchain and talks to Vercel Blob +
// the app's process route — all three are mocked so the tests cover the
// HTTP contract (auth, busy, health) and the orchestration calls.
const execFile = vi.fn();
vi.mock("node:child_process", () => ({ execFile }));

const blobGet = vi.fn();
vi.mock("@vercel/blob", () => ({ get: blobGet }));

const listScanFrames = vi.fn<(scanId: string) => Promise<string[]>>();
const putScanArtifact =
  vi.fn<(scanId: string, name: string, data: Buffer) => Promise<{ url: string; pathname: string }>>();
vi.mock("@/lib/scan-blob", () => ({
  listScanFrames: (scanId: string) => listScanFrames(scanId),
  putScanArtifact: (scanId: string, name: string, data: Buffer) =>
    putScanArtifact(scanId, name, data),
}));

const SECRET = "k".repeat(32);
const APP = "https://app.test";

// The test client itself uses fetch against the live ephemeral server —
// the stub only intercepts the worker's callbacks to the app URL.
const realFetch = globalThis.fetch;
const appFetch = vi.fn();
vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith(APP)) return appFetch(input, init);
  return realFetch(input, init);
});

type WorkerConfig = Parameters<
  typeof import("../scripts/scan-worker").createScanWorker
>[0];

async function startWorker(overrides: Partial<WorkerConfig> = {}) {
  const { createScanWorker } = await import("../scripts/scan-worker");
  const { server, isBusy } = createScanWorker({
    port: 0,
    workerKey: SECRET,
    appUrl: APP,
    workDir: undefined,
    defaceBin: "deface",
    colmapBin: "colmap",
    gsplatBin: "gsplat",
    spzBin: "spz-convert",
    ...overrides,
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return { server, isBusy, base: `http://127.0.0.1:${port}` };
}

const post = (base: string, path: string, body: unknown, key?: string) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key ? { "x-scan-worker-key": key } : {}),
    },
    body: JSON.stringify(body),
  });

/** Resolves once the condition holds — polls instead of sleeping fixed. */
async function until(cond: () => boolean, ms = 5000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Bodies the worker POSTed back to the app's process route, in order. */
const postedStatuses = () =>
  appFetch.mock.calls.map((c) =>
    JSON.parse(String((c[1] as RequestInit).body)),
  ) as { status: string }[];

describe("scan-worker", () => {
  let server: Server | null = null;

  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "token");
    execFile.mockReset();
    blobGet.mockReset();
    listScanFrames.mockReset();
    putScanArtifact.mockReset();
    appFetch.mockReset().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { status?: string };
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, status: body.status ?? "processing" }), {
          status: 200,
        }),
      );
    });
  });

  afterEach(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    server = null;
    vi.unstubAllEnvs();
  });

  it("GET /health reports liveness without auth", async () => {
    const w = await startWorker();
    server = w.server;
    const res = await fetch(`${w.base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, busy: false });
  });

  it("401s a missing or wrong worker key, 503s when unconfigured", async () => {
    const w = await startWorker();
    server = w.server;
    expect((await post(w.base, "/run", { scan_id: "s1" })).status).toBe(401);
    expect((await post(w.base, "/run", { scan_id: "s1" }, "wrong")).status).toBe(401);

    const noKey = await startWorker({ workerKey: undefined });
    const noKeyPort = (noKey.server.address() as AddressInfo).port;
    expect(
      (await post(`http://127.0.0.1:${noKeyPort}`, "/run", { scan_id: "s1" }, SECRET)).status,
    ).toBe(503);
    await new Promise<void>((r) => noKey.server.close(() => r()));
  });

  it("accepts a keyed run and refuses a second job while busy", async () => {
    // Park the job at the frame listing so `busy` stays set deterministically.
    const releaseRef: { fn?: () => void } = {};
    listScanFrames.mockImplementation(
      () =>
        new Promise<string[]>((res) => {
          releaseRef.fn = () => res([]);
        }),
    );

    const w = await startWorker();
    server = w.server;

    const first = await post(w.base, "/run", { scan_id: "vs-1" }, SECRET);
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ accepted: true, scan_id: "vs-1" });
    await until(() => w.isBusy());

    const health = await (await fetch(`${w.base}/health`)).json();
    expect(health.busy).toBe(true);

    const second = await post(w.base, "/run", { scan_id: "vs-2" }, SECRET);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "busy" });

    // Let the parked job finish — an empty manifest ends it as rejected.
    releaseRef.fn?.();
    await until(() => !w.isBusy());
    expect(postedStatuses().map((s) => s.status)).toEqual(["processing", "rejected"]);
  });

  it("400s on bad bodies and 404s unknown paths", async () => {
    const w = await startWorker();
    server = w.server;
    expect((await post(w.base, "/run", "x", SECRET)).status).toBe(400);
    expect((await post(w.base, "/run", { scan_id: "../escape" }, SECRET)).status).toBe(400);
    expect((await post(w.base, "/run", {}, SECRET)).status).toBe(400);
    expect((await fetch(`${w.base}/nope`)).status).toBe(404);
    expect((await fetch(`${w.base}/run`)).status).toBe(404);
  });

  it("runs the documented pipeline and drives the publish chain", async () => {
    execFile.mockImplementation(
      (_b: string, _a: string[], _o: object, cb: (e: Error | null, o: string, s: string) => void) =>
        cb(null, "", ""),
    );
    listScanFrames.mockResolvedValue(["https://blob.test/scans/vs-9/0.jpg"]);
    blobGet.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([0xff, 0xd8, 0xff]));
          c.close();
        },
      }),
    });
    putScanArtifact.mockResolvedValue({
      url: "https://blob.test/scans/vs-9/artifacts/final-splat.spz",
      pathname: "scans/vs-9/artifacts/final-splat.spz",
    });
    // The SPZ export step is mocked, so the file it would have produced is
    // created where the upload reads it (dir = WORK_DIR/scan-<id>).
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const workRoot = join(tmpdir(), `scan-worker-test-${Date.now()}`);
    mkdirSync(join(workRoot, "scan-vs-9"), { recursive: true });
    writeFileSync(join(workRoot, "scan-vs-9", "final-splat.spz"), Buffer.from([1, 2, 3]));

    const w = await startWorker({ workDir: workRoot });
    server = w.server;

    const res = await post(w.base, "/run", { scan_id: "vs-9" }, SECRET);
    expect(res.status).toBe(202);
    await until(() => !w.isBusy());

    // Tool order: deface → colmap → gsplat → spz-convert.
    expect(execFile.mock.calls.map((c) => c[0])).toEqual([
      "deface",
      "colmap",
      "gsplat",
      "spz-convert",
    ]);
    // Status chain: processing kick, then preview → refining → published
    // carrying the artifact url + the blur attestation.
    const statuses = postedStatuses();
    expect(statuses.map((s) => s.status)).toEqual([
      "processing",
      "preview",
      "refining",
      "published",
    ]);
    expect(statuses[3]).toMatchObject({
      splat_url: "https://blob.test/scans/vs-9/artifacts/final-splat.spz",
      blur_verified: true,
    });
    // Every callback went to the app's process route with the worker key.
    for (const c of appFetch.mock.calls) {
      expect(String(c[0])).toBe(`${APP}/api/venue-scans/vs-9/process`);
      expect((c[1] as RequestInit).headers).toMatchObject({
        "x-scan-worker-key": SECRET,
      });
    }
  });

  it("marks the scan rejected when a pipeline tool fails — stderr stays local", async () => {
    listScanFrames.mockResolvedValue(["https://blob.test/scans/vs-5/0.jpg"]);
    blobGet.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([1]));
          c.close();
        },
      }),
    });
    execFile.mockImplementation(
      (bin: string, _a: string[], _o: object, cb: (e: Error | null, o: string, s: string) => void) => {
        if (bin === "deface")
          cb(Object.assign(new Error("exit 1"), { code: 1 }), "", "SECRET STDERR DETAIL");
        else cb(null, "", "");
      },
    );

    const w = await startWorker();
    server = w.server;
    const res = await post(w.base, "/run", { scan_id: "vs-5" }, SECRET);
    expect(res.status).toBe(202);
    expect(await res.text()).not.toContain("SECRET STDERR DETAIL");
    await until(() => !w.isBusy());

    expect(postedStatuses().map((s) => s.status)).toEqual(["processing", "rejected"]);
  });
});
