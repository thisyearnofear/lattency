import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const b44InsertVenueScan = vi
  .fn()
  .mockResolvedValue({ scanId: "vs-1", superseded: false });
const b44ListVenueScans = vi.fn().mockResolvedValue([]);
const b44RequestVenueScanTakedown = vi.fn().mockResolvedValue(undefined);
const b44GetCafeById = vi.fn().mockResolvedValue({ city: "london" });
const checkRateLimit = vi.fn().mockResolvedValue(true);
const cfg = { configured: true };

vi.mock("@/lib/base44-data", () => ({
  get base44Configured() {
    return cfg.configured;
  },
  b44GetCafeById: (...a: unknown[]) => b44GetCafeById(...a),
  b44InsertVenueScan: (...a: unknown[]) => b44InsertVenueScan(...a),
  b44ListVenueScans: (...a: unknown[]) => b44ListVenueScans(...a),
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

  it("gates cities — enabled+listed → true, unlisted/empty → false", async () => {
    const { venueCaptureAllowedForCity } = await import(
      "@/lib/venue-capture-policy"
    );
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    vi.stubEnv("VENUE_CAPTURE_CITIES", "london");
    expect(venueCaptureAllowedForCity("london")).toBe(true);
    expect(venueCaptureAllowedForCity("London")).toBe(true);
    expect(venueCaptureAllowedForCity("paris")).toBe(false);
    expect(venueCaptureAllowedForCity(undefined)).toBe(false);

    vi.stubEnv("VENUE_CAPTURE_CITIES", "");
    expect(venueCaptureAllowedForCity("london")).toBe(false);

    vi.stubEnv("VENUE_CAPTURE_CITIES", "london");
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "");
    expect(venueCaptureAllowedForCity("london")).toBe(false);
  });

  it("gates the pilot crew — unset allows anyone, set allows members only", async () => {
    const { venueCaptureCrewAllowed } = await import(
      "@/lib/venue-capture-policy"
    );
    vi.stubEnv("VENUE_CAPTURE_CREW", "");
    expect(venueCaptureCrewAllowed("contrib-anyone")).toBe(true);

    vi.stubEnv("VENUE_CAPTURE_CREW", "contrib-crew-1, contrib-crew-2");
    expect(venueCaptureCrewAllowed("contrib-crew-1")).toBe(true);
    expect(venueCaptureCrewAllowed("contrib-abc")).toBe(false);
  });
});

describe("POST /api/venue-scans", () => {
  beforeEach(() => {
    cfg.configured = true;
    [b44InsertVenueScan, b44ListVenueScans, b44GetCafeById].forEach((f) =>
      f.mockClear(),
    );
    b44GetCafeById.mockResolvedValue({ city: "london" });
    vi.stubEnv("VENUE_CAPTURE_CITIES", "london");
    vi.stubEnv("VENUE_CAPTURE_CREW", "");
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
      supersedesId: null,
      consentAttestation: {
        venue_permission: true,
        patron_notice: true,
        timestamp: "2026-11-10T08:00:00Z",
      },
    });
  });

  it("accepts supersedes_id and reports whether the prior scan retired", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    b44InsertVenueScan.mockResolvedValueOnce({ scanId: "vs-2", superseded: true });
    const { POST } = await import("@/app/api/venue-scans/route");
    const res = await POST(
      post("http://x/api/venue-scans", { ...VALID_SCAN, supersedes_id: "vs-1" }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      scanId: "vs-2",
      status: "captured",
      superseded: true,
    });
    expect(b44InsertVenueScan).toHaveBeenCalledWith(
      expect.objectContaining({ supersedesId: "vs-1" }),
    );
  });

  it("400s on a malformed supersedes_id before touching the backend", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { POST } = await import("@/app/api/venue-scans/route");
    for (const supersedes_id of [42, " ", "x".repeat(129), ["vs-1"]]) {
      const res = await POST(
        post("http://x/api/venue-scans", { ...VALID_SCAN, supersedes_id }),
      );
      expect(res.status).toBe(400);
    }
    expect(b44GetCafeById).not.toHaveBeenCalled();
    expect(b44InsertVenueScan).not.toHaveBeenCalled();
  });

  it("503s when the backend is unconfigured even with the flag on", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    cfg.configured = false;
    const { POST } = await import("@/app/api/venue-scans/route");
    const res = await POST(post("http://x/api/venue-scans", VALID_SCAN));
    expect(res.status).toBe(503);
    expect(b44InsertVenueScan).not.toHaveBeenCalled();
  });

  it("403s a venue outside the pilot cities — the record's city rules", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    b44GetCafeById.mockResolvedValue({ city: "paris" });
    const { POST } = await import("@/app/api/venue-scans/route");
    const res = await POST(post("http://x/api/venue-scans", VALID_SCAN));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(
      "Capture pilot is London-only for now",
    );
    expect(b44InsertVenueScan).not.toHaveBeenCalled();
  });

  it("never trusts the client city hint — spoofed london still 403s for paris", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    b44GetCafeById.mockResolvedValue({ city: "paris" });
    const { POST } = await import("@/app/api/venue-scans/route");
    const res = await POST(
      post("http://x/api/venue-scans", { ...VALID_SCAN, city: "london" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/city hint/i);
    expect(b44InsertVenueScan).not.toHaveBeenCalled();
  });

  it("403s every venue when the pilot city list is empty", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    vi.stubEnv("VENUE_CAPTURE_CITIES", "");
    const { POST } = await import("@/app/api/venue-scans/route");
    const res = await POST(post("http://x/api/venue-scans", VALID_SCAN));
    expect(res.status).toBe(403);
    expect(b44InsertVenueScan).not.toHaveBeenCalled();
  });

  it("403s non-crew contributors when VENUE_CAPTURE_CREW is set", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    vi.stubEnv("VENUE_CAPTURE_CREW", "contrib-crew-1,contrib-crew-2");
    const { POST } = await import("@/app/api/venue-scans/route");
    const res = await POST(post("http://x/api/venue-scans", VALID_SCAN));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Pilot crew only");
    expect(b44GetCafeById).not.toHaveBeenCalled();
    expect(b44InsertVenueScan).not.toHaveBeenCalled();
  });

  it("creates for a crew member when VENUE_CAPTURE_CREW lists them", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    vi.stubEnv("VENUE_CAPTURE_CREW", "contrib-abc");
    const { POST } = await import("@/app/api/venue-scans/route");
    const res = await POST(post("http://x/api/venue-scans", VALID_SCAN));
    expect(res.status).toBe(201);
    expect(b44InsertVenueScan).toHaveBeenCalledTimes(1);
  });

  it("404s when the venue record can't be resolved", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    b44GetCafeById.mockResolvedValue(null);
    const { POST } = await import("@/app/api/venue-scans/route");
    const res = await POST(post("http://x/api/venue-scans", VALID_SCAN));
    expect(res.status).toBe(404);
    expect(b44InsertVenueScan).not.toHaveBeenCalled();
  });
});

describe("GET /api/venue-scans", () => {
  beforeEach(() => {
    cfg.configured = true;
    b44ListVenueScans.mockClear();
    b44GetCafeById.mockClear();
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
    expect(b44ListVenueScans).not.toHaveBeenCalled();
  });

  it("returns the gateway-projected scans for a venue", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    b44ListVenueScans.mockResolvedValueOnce([
      { id: "vs-1", venueId: "c1", splatUrl: "https://cdn/x.spz", status: "published", created: "t" },
    ]);
    const { GET } = await import("@/app/api/venue-scans/route");
    const res = await GET(new NextRequest("http://x/api/venue-scans?venue_id=c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scans).toHaveLength(1);
    expect(b44ListVenueScans).toHaveBeenCalledWith("c1");
  });

  it("400s without venue_id", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    const { GET } = await import("@/app/api/venue-scans/route");
    const res = await GET(new NextRequest("http://x/api/venue-scans"));
    expect(res.status).toBe(400);
    expect(b44ListVenueScans).not.toHaveBeenCalled();
  });

  it("serves published scans regardless of the pilot city list", async () => {
    vi.stubEnv("VENUE_CAPTURE_ENABLED", "1");
    vi.stubEnv("VENUE_CAPTURE_CITIES", "paris");
    b44ListVenueScans.mockResolvedValueOnce([
      { id: "vs-9", venueId: "c1", splatUrl: null, status: "published", created: "t" },
    ]);
    const { GET } = await import("@/app/api/venue-scans/route");
    const res = await GET(new NextRequest("http://x/api/venue-scans?venue_id=c1"));
    expect(res.status).toBe(200);
    expect((await res.json()).scans).toHaveLength(1);
    expect(b44GetCafeById).not.toHaveBeenCalled();
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
