import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const b44InsertVenueScan = vi.fn().mockResolvedValue("vs-1");
const b44ListPublishedVenueScans = vi.fn().mockResolvedValue([]);
const b44RequestVenueScanTakedown = vi.fn().mockResolvedValue(undefined);
const checkRateLimit = vi.fn().mockResolvedValue(true);
const cfg = { configured: true };

vi.mock("@/lib/base44-data", () => ({
  get base44Configured() {
    return cfg.configured;
  },
  b44InsertVenueScan: (...a: unknown[]) => b44InsertVenueScan(...a),
  b44ListPublishedVenueScans: (...a: unknown[]) => b44ListPublishedVenueScans(...a),
  b44RequestVenueScanTakedown: (...a: unknown[]) => b44RequestVenueScanTakedown(...a),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
  hashIp: () => "h",
}));

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_SCAN = {
  venue_id: "c1",
  contributor_id: "contrib-abc",
  consent_attestation: {
    venue_permission: true,
    patron_notice: true,
    timestamp: "2026-11-10T08:00:00Z",
  },
};

describe("venue capture policy", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is off by default and on only for the exact value '1'", async () => {
    const { venueCaptureEnabled } = await import("@/lib/venue-capture-policy");
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "");
    expect(venueCaptureEnabled()).toBe(false);
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "true");
    expect(venueCaptureEnabled()).toBe(false);
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    expect(venueCaptureEnabled()).toBe(true);
  });
});

describe("POST /api/venue-scans", () => {
  beforeEach(() => {
    cfg.configured = true;
    [b44InsertVenueScan, b44ListPublishedVenueScans].forEach((f) => f.mockClear());
  });
  afterEach(() => vi.unstubAllEnvs());

  it("503s paused before any work when the flag is off, even for a valid body", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "");
    const { POST } = await import("@/app/api/venue-scans/route");
    const res = await POST(post("http://x/api/venue-scans", VALID_SCAN));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("VENUE_CAPTURE_PAUSED");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(b44InsertVenueScan).not.toHaveBeenCalled();
  });

  it("400s on non-object bodies, missing attestation, and partial attestation", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { POST } = await import("@/app/api/venue-scans/route");

    for (const body of [null, [], "x"]) {
      expect((await POST(post("http://x/api/venue-scans", body))).status).toBe(400);
    }
    const noConsent = { venue_id: "c1", contributor_id: "contrib-abc" };
    expect((await POST(post("http://x/api/venue-scans", noConsent))).status).toBe(400);
    for (const partial of [
      { venue_permission: true },
      { venue_permission: true, patron_notice: false },
      { venue_permission: false, patron_notice: true },
    ]) {
      const res = await POST(
        post("http://x/api/venue-scans", {
          ...VALID_SCAN,
          consent_attestation: partial,
        }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/consent/i);
    }
    expect(b44InsertVenueScan).not.toHaveBeenCalled();
  });

  it("400s on missing contributor_id and malformed ids", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { POST } = await import("@/app/api/venue-scans/route");
    const noContrib = { ...VALID_SCAN } as Record<string, unknown>;
    delete noContrib.contributor_id;
    expect((await POST(post("http://x/api/venue-scans", noContrib))).status).toBe(400);
    expect(
      (await POST(post("http://x/api/venue-scans", { ...VALID_SCAN, venue_id: " " }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          post("http://x/api/venue-scans", { ...VALID_SCAN, contributor_id: 42 }),
        )
      ).status,
    ).toBe(400);
    expect(b44InsertVenueScan).not.toHaveBeenCalled();
  });

  it("creates with the allowlist only — injected fields never reach the gateway", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { POST } = await import("@/app/api/venue-scans/route");
    const res = await POST(
      post("http://x/api/venue-scans", {
        ...VALID_SCAN,
        status: "published",
        splat_url: "https://evil",
        blur_verified: true,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ scanId: "vs-1", status: "captured" });
    expect(b44InsertVenueScan).toHaveBeenCalledWith({
      venueId: "c1",
      contributorId: "contrib-abc",
      captureAssetUrl: null,
      consentAttestation: {
        venue_permission: true,
        patron_notice: true,
        timestamp: "2026-11-10T08:00:00Z",
      },
    });
  });

  it("503s when the backend is unconfigured even with the flag on", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    cfg.configured = false;
    const { POST } = await import("@/app/api/venue-scans/route");
    const res = await POST(post("http://x/api/venue-scans", VALID_SCAN));
    expect(res.status).toBe(503);
    expect(b44InsertVenueScan).not.toHaveBeenCalled();
  });
});

describe("GET /api/venue-scans", () => {
  beforeEach(() => {
    cfg.configured = true;
    b44ListPublishedVenueScans.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("503s paused when the flag is off", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "");
    const { GET } = await import("@/app/api/venue-scans/route");
    const res = await GET(
      new NextRequest("http://x/api/venue-scans?venue_id=c1"),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("VENUE_CAPTURE_PAUSED");
    expect(b44ListPublishedVenueScans).not.toHaveBeenCalled();
  });

  it("returns the gateway-projected scans for a venue", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    b44ListPublishedVenueScans.mockResolvedValueOnce([
      { id: "vs-1", venueId: "c1", splatUrl: "https://cdn/x.spz", status: "published", created: "t" },
    ]);
    const { GET } = await import("@/app/api/venue-scans/route");
    const res = await GET(new NextRequest("http://x/api/venue-scans?venue_id=c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scans).toHaveLength(1);
    expect(b44ListPublishedVenueScans).toHaveBeenCalledWith("c1");
  });

  it("400s without venue_id", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { GET } = await import("@/app/api/venue-scans/route");
    const res = await GET(new NextRequest("http://x/api/venue-scans"));
    expect(res.status).toBe(400);
    expect(b44ListPublishedVenueScans).not.toHaveBeenCalled();
  });
});

describe("POST /api/venue-scans/[id]/takedown", () => {
  const params = { params: Promise.resolve({ id: "vs-1" }) };
  beforeEach(() => {
    cfg.configured = true;
    b44RequestVenueScanTakedown.mockClear();
    checkRateLimit.mockClear();
    checkRateLimit.mockResolvedValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("503s paused when the flag is off", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "");
    const { POST } = await import("@/app/api/venue-scans/[id]/takedown/route");
    const res = await POST(
      post("http://x/api/venue-scans/vs-1/takedown", { venue_id: "c1", reason: "owner" }),
      params,
    );
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("VENUE_CAPTURE_PAUSED");
    expect(b44RequestVenueScanTakedown).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("sets takedown_requested via the gateway for a valid request", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { POST } = await import("@/app/api/venue-scans/[id]/takedown/route");
    const res = await POST(
      post("http://x/api/venue-scans/vs-1/takedown", {
        venue_id: "c1",
        reason: "  filmed without house permission  ",
      }),
      params,
    );
    expect(res.status).toBe(200);
    expect(b44RequestVenueScanTakedown).toHaveBeenCalledWith(
      "vs-1",
      "c1",
      "filmed without house permission",
    );
    expect(checkRateLimit).toHaveBeenCalledWith("h", { kind: "takedown" });
  });

  it("400s on missing venue_id and on missing or over-long reasons", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { POST } = await import("@/app/api/venue-scans/[id]/takedown/route");
    for (const body of [
      { reason: "x" },
      { venue_id: "c1" },
      { venue_id: "c1", reason: " " },
      { venue_id: "c1", reason: "x".repeat(501) },
      { venue_id: "c1", reason: 42 },
    ]) {
      const res = await POST(post("http://x/api/venue-scans/vs-1/takedown", body), params);
      expect(res.status).toBe(400);
    }
    expect(b44RequestVenueScanTakedown).not.toHaveBeenCalled();
  });

  it("429s when the takedown scope is exhausted", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    checkRateLimit.mockResolvedValue(false);
    const { POST } = await import("@/app/api/venue-scans/[id]/takedown/route");
    const res = await POST(
      post("http://x/api/venue-scans/vs-1/takedown", { venue_id: "c1", reason: "spam" }),
      params,
    );
    expect(res.status).toBe(429);
    expect(b44RequestVenueScanTakedown).not.toHaveBeenCalled();
  });
});
