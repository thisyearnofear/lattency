import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const b44GetVenueScan = vi.fn().mockResolvedValue({
  id: "vs-1",
  venueId: "c1",
  contributorId: "contrib-abc",
  status: "captured",
  supersedesId: null,
});
const b44GetCafeById = vi.fn().mockResolvedValue({ city: "london" });
const b44SetVenueScanStatus = vi
  .fn()
  .mockImplementation(async (input: { status: string }) => ({
    status: input.status,
    deduped: false,
  }));
const cfg = { configured: true };

vi.mock("@/lib/base44-data", () => ({
  get base44Configured() {
    return cfg.configured;
  },
  b44GetCafeById: (...a: unknown[]) => b44GetCafeById(...a),
  b44GetVenueScan: (...a: unknown[]) => b44GetVenueScan(...a),
  b44SetVenueScanStatus: (...a: unknown[]) => b44SetVenueScanStatus(...a),
}));

const WORKER_KEY = "w".repeat(32);
const PARAMS = { params: Promise.resolve({ id: "vs-1" }) };

function post(
  body: unknown,
  opts: { id?: string; workerKey?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.workerKey !== undefined) headers["x-scan-worker-key"] = opts.workerKey;
  return new NextRequest(
    `http://x/api/venue-scans/${opts.id ?? "vs-1"}/process`,
    { method: "POST", headers, body: JSON.stringify(body) },
  );
}

const CONTRIBUTOR_BODY = { contributor_id: "contrib-abc" };

function stubScanStatus(status: string) {
  b44GetVenueScan.mockResolvedValue({
    id: "vs-1",
    venueId: "c1",
    contributorId: "contrib-abc",
    status,
    supersedesId: null,
  });
}

describe("POST /api/venue-scans/[id]/process — contributor enqueue", () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });

  beforeEach(() => {
    cfg.configured = true;
    [b44GetVenueScan, b44GetCafeById, b44SetVenueScanStatus, fetchMock].forEach(
      (f) => f.mockClear(),
    );
    stubScanStatus("captured");
    b44GetCafeById.mockResolvedValue({ city: "london" });
    b44SetVenueScanStatus.mockImplementation(
      async (input: { status: string }) => ({
        status: input.status,
        deduped: false,
      }),
    );
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    vi.stubEnv("VENUE_CAPTURE_CITIES", "london");
    vi.stubEnv("VENUE_CAPTURE_CREW", "");
    vi.stubEnv("SCAN_WORKER_KEY", WORKER_KEY);
    vi.stubEnv("SCAN_WORKER_URL", "");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("503s paused when the flag is off", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "");
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    const res = await POST(post(CONTRIBUTOR_BODY), PARAMS);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("VENUE_CAPTURE_PAUSED");
    expect(b44SetVenueScanStatus).not.toHaveBeenCalled();
  });

  it("marks a captured scan processing and reports queued:false without a worker URL", async () => {
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    const res = await POST(post(CONTRIBUTOR_BODY), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      status: "processing",
      queued: false,
    });
    expect(b44SetVenueScanStatus).toHaveBeenCalledWith({
      scanId: "vs-1",
      status: "processing",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enqueues at SCAN_WORKER_URL with the worker key when configured", async () => {
    vi.stubEnv("SCAN_WORKER_URL", "https://worker.internal/enqueue");
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    const res = await POST(post(CONTRIBUTOR_BODY), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      status: "processing",
      queued: true,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://worker.internal/enqueue");
    expect(init.method).toBe("POST");
    expect(init.headers["x-scan-worker-key"]).toBe(WORKER_KEY);
    expect(JSON.parse(init.body)).toEqual({ scan_id: "vs-1" });
  });

  it("reports queued:false when the worker endpoint rejects or is unreachable", async () => {
    vi.stubEnv("SCAN_WORKER_URL", "https://worker.internal/enqueue");
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    expect((await POST(post(CONTRIBUTOR_BODY), PARAMS)).json()).resolves.toEqual(
      { ok: true, status: "processing", queued: false },
    );
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect((await POST(post(CONTRIBUTOR_BODY), PARAMS)).json()).resolves.toEqual(
      { ok: true, status: "processing", queued: false },
    );
  });

  it("retries the enqueue on a scan already at processing without rewriting status", async () => {
    vi.stubEnv("SCAN_WORKER_URL", "https://worker.internal/enqueue");
    stubScanStatus("processing");
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    const res = await POST(post(CONTRIBUTOR_BODY), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      status: "processing",
      queued: true,
    });
    expect(b44SetVenueScanStatus).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("409s a scan that is past processing", async () => {
    stubScanStatus("preview");
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    const res = await POST(post(CONTRIBUTOR_BODY), PARAMS);
    expect(res.status).toBe(409);
    expect(b44SetVenueScanStatus).not.toHaveBeenCalled();
  });

  it("400s on missing contributor_id and on a status other than processing", async () => {
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    expect((await POST(post({}), PARAMS)).status).toBe(400);
    for (const status of ["preview", "published", "rejected"]) {
      expect(
        (await POST(post({ ...CONTRIBUTOR_BODY, status }), PARAMS)).status,
      ).toBe(400);
    }
    expect(b44SetVenueScanStatus).not.toHaveBeenCalled();
  });

  it("404s on a missing scan and 403s on a contributor mismatch", async () => {
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    b44GetVenueScan.mockResolvedValueOnce(null);
    expect((await POST(post(CONTRIBUTOR_BODY), PARAMS)).status).toBe(404);

    b44GetVenueScan.mockResolvedValueOnce({
      id: "vs-1",
      venueId: "c1",
      contributorId: "contrib-other",
      status: "captured",
      supersedesId: null,
    });
    expect((await POST(post(CONTRIBUTOR_BODY), PARAMS)).status).toBe(403);
    expect(b44SetVenueScanStatus).not.toHaveBeenCalled();
  });

  it("403s non-crew contributors and venues outside the pilot cities", async () => {
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    vi.stubEnv("VENUE_CAPTURE_CREW", "contrib-crew-1");
    expect((await POST(post(CONTRIBUTOR_BODY), PARAMS)).status).toBe(403);
    vi.stubEnv("VENUE_CAPTURE_CREW", "");

    b44GetCafeById.mockResolvedValueOnce({ city: "paris" });
    expect((await POST(post(CONTRIBUTOR_BODY), PARAMS)).status).toBe(403);
    expect(b44SetVenueScanStatus).not.toHaveBeenCalled();
  });

  it("503s when the backend is unconfigured", async () => {
    cfg.configured = false;
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    const res = await POST(post(CONTRIBUTOR_BODY), PARAMS);
    expect(res.status).toBe(503);
    expect(b44GetVenueScan).not.toHaveBeenCalled();
  });

  it("maps a gateway 409 on the transition write", async () => {
    b44SetVenueScanStatus.mockRejectedValueOnce({ status: 409 });
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    const res = await POST(post(CONTRIBUTOR_BODY), PARAMS);
    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/venue-scans/[id]/process — worker key", () => {
  beforeEach(() => {
    cfg.configured = true;
    [b44GetVenueScan, b44GetCafeById, b44SetVenueScanStatus].forEach((f) =>
      f.mockClear(),
    );
    b44SetVenueScanStatus.mockImplementation(
      async (input: { status: string }) => ({
        status: input.status,
        deduped: false,
      }),
    );
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    vi.stubEnv("VENUE_CAPTURE_CITIES", "london");
    vi.stubEnv("SCAN_WORKER_KEY", WORKER_KEY);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("401s a wrong key and 503s when SCAN_WORKER_KEY is unset", async () => {
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    const bad = await POST(
      post({ status: "preview" }, { workerKey: "wrong" }),
      PARAMS,
    );
    expect(bad.status).toBe(401);

    vi.stubEnv("SCAN_WORKER_KEY", "");
    const unset = await POST(
      post({ status: "preview" }, { workerKey: WORKER_KEY }),
      PARAMS,
    );
    expect(unset.status).toBe(503);
    expect(b44SetVenueScanStatus).not.toHaveBeenCalled();
  });

  it("accepts a worker-keyed transition without the contributor gate", async () => {
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    const res = await POST(
      post({ status: "preview" }, { workerKey: WORKER_KEY }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      status: "preview",
      deduped: false,
    });
    expect(b44SetVenueScanStatus).toHaveBeenCalledWith({
      scanId: "vs-1",
      status: "preview",
      splatUrl: null,
      blurVerified: undefined,
    });
    // Worker mode is operator-trusted — no contributor/scan/city lookup.
    expect(b44GetVenueScan).not.toHaveBeenCalled();
    expect(b44GetCafeById).not.toHaveBeenCalled();
  });

  it("forwards splat_url and blur_verified on a publish transition", async () => {
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    const res = await POST(
      post(
        {
          status: "published",
          splat_url: "https://blob/scans/vs-1/artifacts/final-splat.spz",
          blur_verified: true,
        },
        { workerKey: WORKER_KEY },
      ),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(b44SetVenueScanStatus).toHaveBeenCalledWith({
      scanId: "vs-1",
      status: "published",
      splatUrl: "https://blob/scans/vs-1/artifacts/final-splat.spz",
      blurVerified: true,
    });
  });

  it("400s on non-worker statuses and bad field shapes", async () => {
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    for (const body of [
      {},
      { status: "captured" },
      { status: "taken_down" },
      { status: "superseded" },
      { status: "garbage" },
      { status: "published", splat_url: "http://insecure/x.spz", blur_verified: true },
      { status: "preview", splat_url: "x".repeat(2049) },
      { status: "preview", blur_verified: "yes" },
    ]) {
      expect(
        (await POST(post(body, { workerKey: WORKER_KEY }), PARAMS)).status,
      ).toBe(400);
    }
    expect(b44SetVenueScanStatus).not.toHaveBeenCalled();
  });

  it("maps gateway failures: 400 invalid, 404 missing, 409 illegal, 503 otherwise", async () => {
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    const cases: [unknown, number][] = [
      [{ status: 400 }, 400],
      [{ status: 404 }, 404],
      [{ status: 409 }, 409],
      [new Error("PRIVATE DETAIL"), 503],
    ];
    for (const [err, expected] of cases) {
      b44SetVenueScanStatus.mockRejectedValueOnce(err);
      const res = await POST(
        post({ status: "preview" }, { workerKey: WORKER_KEY }),
        PARAMS,
      );
      expect(res.status).toBe(expected);
      expect(await res.text()).not.toContain("PRIVATE DETAIL");
    }
  });

  it("no worker header + contributor_id → contributor path, not worker", async () => {
    const { POST } = await import("@/app/api/venue-scans/[id]/process/route");
    // A contributor can't smuggle worker transitions through the public path.
    const res = await POST(
      post({ ...CONTRIBUTOR_BODY, status: "published" }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    expect(b44SetVenueScanStatus).not.toHaveBeenCalled();
  });
});
