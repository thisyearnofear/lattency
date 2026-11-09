import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const b44InsertMeasurement = vi.fn().mockResolvedValue("mid-1");
const b44CreateCafe = vi.fn().mockResolvedValue({ cafeId: "c1", measurementId: "m1" });
const addLocalMeasurement = vi.fn().mockReturnValue("local-m1");
const addLocalCafe = vi.fn().mockReturnValue({ cafeId: "local-c1", measurementId: "local-m1" });
const checkRateLimit = vi.fn().mockResolvedValue(true);
const cfg = { configured: false };

vi.mock("@/lib/base44-data", () => ({
  get base44Configured() { return cfg.configured; },
  b44InsertMeasurement: (...a: unknown[]) => b44InsertMeasurement(...a),
  b44CreateCafe: (...a: unknown[]) => b44CreateCafe(...a),
}));
vi.mock("@/lib/base44", () => ({
  get base44Configured() { return cfg.configured; },
  getBase44: () => ({ functions: { invoke: vi.fn() } }),
}));
vi.mock("@/lib/local-contributions", () => ({
  addLocalMeasurement: (...a: unknown[]) => addLocalMeasurement(...a),
  addLocalCafe: (...a: unknown[]) => addLocalCafe(...a),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
  hashIp: () => "h",
}));
vi.mock("next/server", async (orig) => {
  const mod = await orig<typeof import("next/server")>();
  return { ...mod, after: vi.fn() };
});

function post(url: string, body: unknown) {
  return new NextRequest(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
}
const AUTO = { downMbps: 50, upMbps: 10, latencyMs: 20, downloadBytes: 10_485_760, downloadDurationMs: 1677.7216 };
const MANUAL = { downMbps: 12, upMbps: 4, latencyMs: 30 };

describe("POST /api/measurements validation boundary", () => {
  beforeEach(() => {
    cfg.configured = false;
    [b44InsertMeasurement, addLocalMeasurement, checkRateLimit].forEach((f) => f.mockClear());
    checkRateLimit.mockResolvedValue(true);
  });

  it("rejects null/array bodies before any work", async () => {
    const { POST } = await import("@/app/api/measurements/route");
    for (const body of [null, []]) {
      const res = await POST(post("http://x/api/measurements", body));
      expect(res.status).toBe(400);
    }
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("rejects invalid future measuredAt and incomplete auto before limiter/backend", async () => {
    const { POST } = await import("@/app/api/measurements/route");
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    let res = await POST(post("http://x/api/measurements", { cafeId: "c1", ...MANUAL, measuredAt: future }));
    expect(res.status).toBe(400);
    res = await POST(post("http://x/api/measurements", { cafeId: "c1", ...MANUAL, downloadBytes: 10_485_760 }));
    expect(res.status).toBe(400);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(addLocalMeasurement).not.toHaveBeenCalled();
  });

  it("derives browser-auto from metadata even if client claims manual", async () => {
    const { POST } = await import("@/app/api/measurements/route");
    const res = await POST(post("http://x/api/measurements", { cafeId: "c1", ...AUTO, testMethod: "manual" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.testMethod).toBe("browser-auto");
    expect(body.verification).toBe("community-reported");
    expect(addLocalMeasurement.mock.calls[0][2]).toBe("browser-auto");
  });

  it("manual submission resolves manual", async () => {
    const { POST } = await import("@/app/api/measurements/route");
    const res = await POST(post("http://x/api/measurements", { cafeId: "c1", ...MANUAL }));
    expect((await res.json()).testMethod).toBe("manual");
    expect(addLocalMeasurement.mock.calls[0][2]).toBe("manual");
  });

  it("configured path uses the same derivation; gateway down -> 503", async () => {
    cfg.configured = true;
    const { POST } = await import("@/app/api/measurements/route");
    const res = await POST(post("http://x/api/measurements", { cafeId: "c1", ...AUTO }));
    expect(res.status).toBe(201);
    expect(b44InsertMeasurement.mock.calls[0][0].testMethod).toBe("browser-auto");

    const { ContributionGatewayUnavailable } = await import("@/lib/base44-gateway");
    b44InsertMeasurement.mockRejectedValueOnce(new ContributionGatewayUnavailable());
    const res2 = await POST(post("http://x/api/measurements", { cafeId: "c1", ...MANUAL }));
    expect(res2.status).toBe(503);
  });

  it("maps SDK 404 to cafe-not-found 404", async () => {
    cfg.configured = true;
    const { POST } = await import("@/app/api/measurements/route");
    const err = Object.assign(new Error("not found"), { status: 404 });
    b44InsertMeasurement.mockRejectedValueOnce(err);
    const res = await POST(post("http://x/api/measurements", { cafeId: "missing", ...MANUAL }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/cafes validation boundary", () => {
  const GOOD = {
    name: "Test Cafe", neighbourhood: "N1", lat: 51.5, lng: -0.1,
    photo: "data:image/jpeg;base64,AAAA",
    measurement: { downMbps: 5, upMbps: 1, latencyMs: 20 },
  };

  beforeEach(() => {
    cfg.configured = false;
    b44CreateCafe.mockReset().mockResolvedValue({ cafeId: "c1", measurementId: "m1" });
    addLocalCafe.mockClear();
    checkRateLimit.mockClear();
  });

  it("rejects non-object and bad contributor types before limiter", async () => {
    checkRateLimit.mockClear();
    b44CreateCafe.mockClear();
    const { POST } = await import("@/app/api/cafes/route");
    expect((await POST(post("http://x/api/cafes", null))).status).toBe(400);
    expect((await POST(post("http://x/api/cafes", { ...GOOD, contributorId: 5 }))).status).toBe(400);
    expect((await POST(post("http://x/api/cafes", { ...GOOD, city: 42 }))).status).toBe(400);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(b44CreateCafe).not.toHaveBeenCalled();
  });

  it("accepts valid cafe in offline mode with derived manual method", async () => {
    cfg.configured = false;
    const { POST } = await import("@/app/api/cafes/route");
    const res = await POST(post("http://x/api/cafes", GOOD));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.testMethod).toBe("manual");
    expect(addLocalCafe.mock.calls[0][2]).toBe("manual");
  });

  it.each([false, true])("derives automatic cafe measurements in configured=%s mode", async (configured) => {
    cfg.configured = configured;
    const { POST } = await import("@/app/api/cafes/route");
    const res = await POST(post("http://x/api/cafes", { ...GOOD, measurement: AUTO }));
    expect(res.status).toBe(201);
    expect((await res.json()).testMethod).toBe("browser-auto");
    if (configured) {
      expect(b44CreateCafe.mock.calls[0][0].measurement.testMethod).toBe("browser-auto");
    } else {
      expect(addLocalCafe.mock.calls[0][2]).toBe("browser-auto");
    }
  });

  it("rejects malformed cafe fields and timestamps before consuming a rate limit", async () => {
    const { POST } = await import("@/app/api/cafes/route");
    for (const body of [
      { ...GOOD, neighbourhood: " " },
      { ...GOOD, city: null },
      { ...GOOD, vibe: null },
      { ...GOOD, measurement: { ...AUTO, downloadDurationMs: 0 } },
      { ...GOOD, measurement: { ...MANUAL, measuredAt: "not-a-date" } },
    ]) {
      expect((await POST(post("http://x/api/cafes", body))).status).toBe(400);
    }
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(addLocalCafe).not.toHaveBeenCalled();
    expect(b44CreateCafe).not.toHaveBeenCalled();
  });
});
