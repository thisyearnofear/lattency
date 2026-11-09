import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { VENUE_PHOTO_MAX_CHARS } from "@/base44/shared/cafe-vocabulary";

const b44UpdateVenuePhoto = vi.fn().mockResolvedValue(undefined);
const checkRateLimit = vi.fn().mockResolvedValue(true);
const cfg = { configured: true };

vi.mock("@/lib/base44-data", () => ({
  get base44Configured() {
    return cfg.configured;
  },
  b44UpdateVenuePhoto: (...a: unknown[]) => b44UpdateVenuePhoto(...a),
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

const params = { params: Promise.resolve({ id: "c1" }) };
const JPEG = "data:image/jpeg;base64,QUJD";

describe("POST /api/venues/[id]/photos", () => {
  beforeEach(() => {
    cfg.configured = true;
    b44UpdateVenuePhoto.mockClear().mockResolvedValue(undefined);
    checkRateLimit.mockClear().mockResolvedValue(true);
  });

  it("400s on non-object bodies before the limiter", async () => {
    const { POST } = await import("@/app/api/venues/[id]/photos/route");
    for (const body of [null, [], "x"]) {
      const res = await POST(post("http://x/api/venues/c1/photos", body), params);
      expect(res.status).toBe(400);
    }
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("400s without the people-free affirmation — the consent gate is mandatory", async () => {
    const { POST } = await import("@/app/api/venues/[id]/photos/route");
    for (const consentPeople of [undefined, false, "yes", 1]) {
      const res = await POST(
        post("http://x/api/venues/c1/photos", { photo: JPEG, consentPeople }),
        params,
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/identifiable people/i);
    }
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(b44UpdateVenuePhoto).not.toHaveBeenCalled();
  });

  it("400s on non-image and oversized photo payloads before the limiter", async () => {
    const { POST } = await import("@/app/api/venues/[id]/photos/route");
    for (const photo of [
      undefined,
      42,
      "https://cdn.example/x.jpg",
      "data:text/plain;base64,aGk=",
      "data:image/gif;base64,R0lG",
      "data:image/svg+xml;base64,PHN2Zw==",
      `data:image/jpeg;base64,${"A".repeat(VENUE_PHOTO_MAX_CHARS)}`,
    ]) {
      const res = await POST(
        post("http://x/api/venues/c1/photos", { photo, consentPeople: true }),
        params,
      );
      expect(res.status).toBe(400);
    }
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(b44UpdateVenuePhoto).not.toHaveBeenCalled();
  });

  it("503s when the backend is unconfigured without touching the limiter", async () => {
    cfg.configured = false;
    const { POST } = await import("@/app/api/venues/[id]/photos/route");
    const res = await POST(
      post("http://x/api/venues/c1/photos", { photo: JPEG, consentPeople: true }),
      params,
    );
    expect(res.status).toBe(503);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("429s when the photo scope is exhausted", async () => {
    checkRateLimit.mockResolvedValueOnce(false);
    const { POST } = await import("@/app/api/venues/[id]/photos/route");
    const res = await POST(
      post("http://x/api/venues/c1/photos", { photo: JPEG, consentPeople: true }),
      params,
    );
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("h", { kind: "photo" });
    expect(b44UpdateVenuePhoto).not.toHaveBeenCalled();
  });

  it("lands a JPEG data URL as the venue photo with contributor attribution", async () => {
    const { POST } = await import("@/app/api/venues/[id]/photos/route");
    const res = await POST(
      post("http://x/api/venues/c1/photos", {
        photo: JPEG,
        consentPeople: true,
        contributorId: "contrib-abc",
        injected: "dropped",
      }),
      params,
    );
    expect(res.status).toBe(201);
    expect((await res.json()).verification).toBe("community-reported");
    expect(b44UpdateVenuePhoto).toHaveBeenCalledWith({
      cafeId: "c1",
      photoUrl: JPEG,
      contributorId: "contrib-abc",
      contributorIpHash: "h",
    });
  });

  it("maps a gateway 404 to venue-not-found and other failures to 503", async () => {
    const { POST } = await import("@/app/api/venues/[id]/photos/route");
    b44UpdateVenuePhoto.mockRejectedValueOnce(
      Object.assign(new Error("not found"), { status: 404 }),
    );
    const missing = await POST(
      post("http://x/api/venues/nope/photos", {
        photo: JPEG,
        consentPeople: true,
      }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(missing.status).toBe(404);

    b44UpdateVenuePhoto.mockRejectedValueOnce(new Error("PRIVATE DETAIL"));
    const boom = await POST(
      post("http://x/api/venues/c1/photos", { photo: JPEG, consentPeople: true }),
      params,
    );
    expect(boom.status).toBe(503);
    expect(await boom.text()).not.toContain("PRIVATE DETAIL");
  });
});
