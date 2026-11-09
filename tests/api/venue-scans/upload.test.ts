import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const b44GetVenueScan = vi.fn().mockResolvedValue({
  id: "vs-1",
  venueId: "c1",
  contributorId: "contrib-abc",
  status: "captured",
  supersedesId: null,
});
const b44AppendVenueScanFrame = vi.fn().mockResolvedValue({ received: 1 });
const b44FinalizeVenueScan = vi.fn().mockResolvedValue(undefined);
const b44GetCafeById = vi.fn().mockResolvedValue({ city: "london" });
const checkRateLimit = vi.fn().mockResolvedValue(true);
const cfg = { configured: true };

vi.mock("@/lib/base44-data", () => ({
  get base44Configured() {
    return cfg.configured;
  },
  b44GetCafeById: (...a: unknown[]) => b44GetCafeById(...a),
  b44GetVenueScan: (...a: unknown[]) => b44GetVenueScan(...a),
  b44AppendVenueScanFrame: (...a: unknown[]) => b44AppendVenueScanFrame(...a),
  b44FinalizeVenueScan: (...a: unknown[]) => b44FinalizeVenueScan(...a),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
  hashIp: () => "h",
}));

const PARAMS = { params: Promise.resolve({ id: "vs-1" }) };

// A minimal byte-valid JPEG (SOI + JFIF marker + payload).
const JPEG_B64 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
]).toString("base64");
const PNG_B64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]).toString("base64");

const VALID_FRAME = {
  seq: 0,
  ts: "2026-11-10T08:00:00Z",
  contributor_id: "contrib-abc",
  frame: JPEG_B64,
};

const VALID_FINALIZE = {
  done: true,
  contributor_id: "contrib-abc",
  frameCount: 12,
  qualityScore: 82,
  coverageSectors: ["N", "NE", "E"],
  faceEvents: 1,
};

function post(body: unknown, id = "vs-1") {
  return new NextRequest(`http://x/api/venue-scans/${id}/upload`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function patch(body: unknown, id = "vs-1") {
  return new NextRequest(`http://x/api/venue-scans/${id}/upload`, {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/venue-scans/[id]/upload", () => {
  beforeEach(() => {
    cfg.configured = true;
    [b44GetVenueScan, b44AppendVenueScanFrame, b44GetCafeById, checkRateLimit].forEach(
      (f) => f.mockClear(),
    );
    b44GetVenueScan.mockResolvedValue({
      id: "vs-1",
      venueId: "c1",
      contributorId: "contrib-abc",
      status: "captured",
      supersedesId: null,
    });
    b44GetCafeById.mockResolvedValue({ city: "london" });
    checkRateLimit.mockResolvedValue(true);
    vi.stubEnv("VENUE_CAPTURE_CITIES", "london");
    vi.stubEnv("VENUE_CAPTURE_CREW", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("503s paused before any work when the flag is off", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "");
    const { POST } = await import("@/app/api/venue-scans/[id]/upload/route");
    const res = await POST(post(VALID_FRAME), PARAMS);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("VENUE_CAPTURE_PAUSED");
    expect(b44GetVenueScan).not.toHaveBeenCalled();
  });

  it("appends a validated frame's manifest entry and reports the count", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { POST } = await import("@/app/api/venue-scans/[id]/upload/route");
    const res = await POST(post(VALID_FRAME), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 1 });
    expect(b44AppendVenueScanFrame).toHaveBeenCalledWith({
      scanId: "vs-1",
      contributorId: "contrib-abc",
      seq: 0,
      ts: "2026-11-10T08:00:00Z",
      bytes: 10,
    });
    // The frame bytes themselves are never forwarded — only the manifest.
    const call = b44AppendVenueScanFrame.mock.calls[0][0];
    expect(call).not.toHaveProperty("frame");
    expect(checkRateLimit).toHaveBeenCalledWith("h", {
      kind: "scanframe",
      scanId: "vs-1",
    });
  });

  it("accepts a data-url frame as well as raw base64", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { POST } = await import("@/app/api/venue-scans/[id]/upload/route");
    const res = await POST(
      post({ ...VALID_FRAME, frame: `data:image/jpeg;base64,${JPEG_B64}` }),
      PARAMS,
    );
    expect(res.status).toBe(200);
  });

  it("400s on bad seq values, missing ts, and missing contributor", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { POST } = await import("@/app/api/venue-scans/[id]/upload/route");
    for (const seq of [-1, 1.5, "0", 5000, NaN]) {
      expect(
        (await POST(post({ ...VALID_FRAME, seq }), PARAMS)).status,
      ).toBe(400);
    }
    const noTs = { ...VALID_FRAME } as Record<string, unknown>;
    delete noTs.ts;
    expect((await POST(post(noTs), PARAMS)).status).toBe(400);
    const noContrib = { ...VALID_FRAME } as Record<string, unknown>;
    delete noContrib.contributor_id;
    expect((await POST(post(noContrib), PARAMS)).status).toBe(400);
    expect(b44AppendVenueScanFrame).not.toHaveBeenCalled();
  });

  it("400s on non-JPEG payloads, bad base64, wrong data-url types, and oversize frames", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { POST } = await import("@/app/api/venue-scans/[id]/upload/route");
    const over = Buffer.alloc(513 * 1024, 0xab);
    over[0] = 0xff;
    over[1] = 0xd8;
    over[2] = 0xff;
    for (const frame of [
      PNG_B64,
      "!!!not-base64!!!",
      `data:image/png;base64,${PNG_B64}`,
      `data:text/html;base64,${JPEG_B64}`,
      over.toString("base64"),
      42,
      "",
    ]) {
      expect(
        (await POST(post({ ...VALID_FRAME, frame }), PARAMS)).status,
      ).toBe(400);
    }
    expect(b44AppendVenueScanFrame).not.toHaveBeenCalled();
  });

  it("404s on a missing scan and 403s on a contributor mismatch", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { POST } = await import("@/app/api/venue-scans/[id]/upload/route");
    b44GetVenueScan.mockResolvedValueOnce(null);
    expect((await POST(post(VALID_FRAME), PARAMS)).status).toBe(404);

    b44GetVenueScan.mockResolvedValueOnce({
      id: "vs-1",
      venueId: "c1",
      contributorId: "contrib-other",
      status: "captured",
      supersedesId: null,
    });
    expect((await POST(post(VALID_FRAME), PARAMS)).status).toBe(403);
    expect(b44AppendVenueScanFrame).not.toHaveBeenCalled();
  });

  it("403s non-crew contributors and venues outside the pilot cities", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { POST } = await import("@/app/api/venue-scans/[id]/upload/route");

    vi.stubEnv("VENUE_CAPTURE_CREW", "contrib-crew-1");
    expect((await POST(post(VALID_FRAME), PARAMS)).status).toBe(403);
    vi.stubEnv("VENUE_CAPTURE_CREW", "");

    b44GetCafeById.mockResolvedValueOnce({ city: "paris" });
    const res = await POST(post(VALID_FRAME), PARAMS);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/London-only/);
    expect(b44AppendVenueScanFrame).not.toHaveBeenCalled();
  });

  it("429s when the scanframe scope is exhausted", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    checkRateLimit.mockResolvedValue(false);
    const { POST } = await import("@/app/api/venue-scans/[id]/upload/route");
    const res = await POST(post(VALID_FRAME), PARAMS);
    expect(res.status).toBe(429);
    expect(b44AppendVenueScanFrame).not.toHaveBeenCalled();
  });

  it("503s when the backend is unconfigured", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    cfg.configured = false;
    const { POST } = await import("@/app/api/venue-scans/[id]/upload/route");
    const res = await POST(post(VALID_FRAME), PARAMS);
    expect(res.status).toBe(503);
    expect(b44GetVenueScan).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/venue-scans/[id]/upload", () => {
  beforeEach(() => {
    cfg.configured = true;
    [b44GetVenueScan, b44FinalizeVenueScan, b44GetCafeById].forEach((f) =>
      f.mockClear(),
    );
    b44GetVenueScan.mockResolvedValue({
      id: "vs-1",
      venueId: "c1",
      contributorId: "contrib-abc",
      status: "captured",
      supersedesId: null,
    });
    b44GetCafeById.mockResolvedValue({ city: "london" });
    vi.stubEnv("VENUE_CAPTURE_CITIES", "london");
    vi.stubEnv("VENUE_CAPTURE_CREW", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("503s paused when the flag is off", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "");
    const { PATCH } = await import("@/app/api/venue-scans/[id]/upload/route");
    const res = await PATCH(patch(VALID_FINALIZE), PARAMS);
    expect(res.status).toBe(503);
    expect(b44FinalizeVenueScan).not.toHaveBeenCalled();
  });

  it("finalizes with the manifest fields — status stays captured", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { PATCH } = await import("@/app/api/venue-scans/[id]/upload/route");
    const res = await PATCH(patch(VALID_FINALIZE), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "captured" });
    expect(b44FinalizeVenueScan).toHaveBeenCalledWith({
      scanId: "vs-1",
      contributorId: "contrib-abc",
      frameCount: 12,
      qualityScore: 82,
      coverageSectors: ["N", "NE", "E"],
      faceEvents: 1,
    });
  });

  it("400s on missing done flag, bad numbers, and non-sector strings", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { PATCH } = await import("@/app/api/venue-scans/[id]/upload/route");
    for (const body of [
      { ...VALID_FINALIZE, done: false },
      { ...VALID_FINALIZE, frameCount: -1 },
      { ...VALID_FINALIZE, frameCount: 1.5 },
      { ...VALID_FINALIZE, qualityScore: 101 },
      { ...VALID_FINALIZE, qualityScore: "high" },
      { ...VALID_FINALIZE, coverageSectors: "N" },
      { ...VALID_FINALIZE, coverageSectors: ["N", "NNW"] },
      { ...VALID_FINALIZE, coverageSectors: [1] },
      { ...VALID_FINALIZE, faceEvents: -1 },
      { ...VALID_FINALIZE, faceEvents: 0.5 },
    ]) {
      expect((await PATCH(patch(body), PARAMS)).status).toBe(400);
    }
    expect(b44FinalizeVenueScan).not.toHaveBeenCalled();
  });

  it("accepts null qualityScore / faceEvents and an empty sector list", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { PATCH } = await import("@/app/api/venue-scans/[id]/upload/route");
    const res = await PATCH(
      patch({
        ...VALID_FINALIZE,
        qualityScore: null,
        coverageSectors: [],
        faceEvents: null,
      }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(b44FinalizeVenueScan).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityScore: null,
        coverageSectors: [],
        faceEvents: null,
      }),
    );
  });

  it("404s on a missing scan and 403s on a contributor mismatch", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { PATCH } = await import("@/app/api/venue-scans/[id]/upload/route");
    b44GetVenueScan.mockResolvedValueOnce(null);
    expect((await PATCH(patch(VALID_FINALIZE), PARAMS)).status).toBe(404);

    b44GetVenueScan.mockResolvedValueOnce({
      id: "vs-1",
      venueId: "c1",
      contributorId: "contrib-other",
      status: "captured",
      supersedesId: null,
    });
    expect((await PATCH(patch(VALID_FINALIZE), PARAMS)).status).toBe(403);
    expect(b44FinalizeVenueScan).not.toHaveBeenCalled();
  });
});
