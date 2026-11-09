import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const b44UpdateVenueFact = vi.fn().mockResolvedValue(undefined);
const checkRateLimit = vi.fn().mockResolvedValue(true);
const cfg = { configured: true };

vi.mock("@/lib/base44-data", () => ({
  get base44Configured() {
    return cfg.configured;
  },
  b44UpdateVenueFact: (...a: unknown[]) => b44UpdateVenueFact(...a),
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

describe("POST /api/venues/[id]/facts", () => {
  beforeEach(() => {
    cfg.configured = true;
    b44UpdateVenueFact.mockClear().mockResolvedValue(undefined);
    checkRateLimit.mockClear().mockResolvedValue(true);
  });

  it("400s on non-object bodies before the limiter", async () => {
    const { POST } = await import("@/app/api/venues/[id]/facts/route");
    for (const body of [null, [], "x", 42]) {
      const res = await POST(post("http://x/api/venues/c1/facts", body), params);
      expect(res.status).toBe(400);
    }
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(b44UpdateVenueFact).not.toHaveBeenCalled();
  });

  it("400s on non-allowlisted fields before the limiter", async () => {
    const { POST } = await import("@/app/api/venues/[id]/facts/route");
    for (const field of [
      "id",
      "name",
      "created_by_user_id",
      "rls",
      "photo_url",
      "ai_summary",
      42,
      undefined,
    ]) {
      const res = await POST(
        post("http://x/api/venues/c1/facts", { field, value: "tables" }),
        params,
      );
      expect(res.status).toBe(400);
    }
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(b44UpdateVenueFact).not.toHaveBeenCalled();
  });

  it("400s on values outside the shared vocabulary before the limiter", async () => {
    const { POST } = await import("@/app/api/venues/[id]/facts/route");
    for (const body of [
      { field: "power_outlets", value: "yes" },
      { field: "power_outlets", value: 1 },
      { field: "seating", value: "hammocks" },
      { field: "noise_level", value: "deafening" },
      { field: "table_space", value: "enormous" },
      { field: "price_tier", value: "ultra" },
      { field: "venue_type", value: "spaceship" },
      { field: "milk_options", value: "yak" },
      { field: "milk_options", value: ["oat", "yak"] },
      { field: "wifi_network", value: "x".repeat(65) },
      { field: "wifi_network", value: "   " },
      { field: "wifi_network", value: 42 },
    ]) {
      const res = await POST(post("http://x/api/venues/c1/facts", body), params);
      expect(res.status).toBe(400);
    }
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(b44UpdateVenueFact).not.toHaveBeenCalled();
  });

  it("503s when the backend is unconfigured without touching the limiter", async () => {
    cfg.configured = false;
    const { POST } = await import("@/app/api/venues/[id]/facts/route");
    const res = await POST(
      post("http://x/api/venues/c1/facts", { field: "seating", value: "tables" }),
      params,
    );
    expect(res.status).toBe(503);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(b44UpdateVenueFact).not.toHaveBeenCalled();
  });

  it("429s when the fact scope is exhausted", async () => {
    checkRateLimit.mockResolvedValueOnce(false);
    const { POST } = await import("@/app/api/venues/[id]/facts/route");
    const res = await POST(
      post("http://x/api/venues/c1/facts", { field: "seating", value: "tables" }),
      params,
    );
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("h", { kind: "fact" });
    expect(b44UpdateVenueFact).not.toHaveBeenCalled();
  });

  it("writes only the allowlisted field/value — injected body keys never reach the gateway", async () => {
    const { POST } = await import("@/app/api/venues/[id]/facts/route");
    const res = await POST(
      post("http://x/api/venues/c1/facts", {
        field: "seating",
        value: "tables",
        contributorId: "contrib-abc",
        is_admin: true,
        approved: true,
        extra: { nested: "evil" },
      }),
      params,
    );
    expect(res.status).toBe(201);
    expect(b44UpdateVenueFact).toHaveBeenCalledTimes(1);
    const call = b44UpdateVenueFact.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toEqual({
      cafeId: "c1",
      field: "seating",
      value: "tables",
      contributorId: "contrib-abc",
      contributorIpHash: "h",
    });
    const body = await res.json();
    expect(body.verification).toBe("community-reported");
  });

  it("maps a gateway 404 to venue-not-found and other failures to 503", async () => {
    const { POST } = await import("@/app/api/venues/[id]/facts/route");
    b44UpdateVenueFact.mockRejectedValueOnce(
      Object.assign(new Error("not found"), { status: 404 }),
    );
    const missing = await POST(
      post("http://x/api/venues/nope/facts", {
        field: "seating",
        value: "tables",
      }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(missing.status).toBe(404);

    const { ContributionGatewayUnavailable } = await import(
      "@/lib/base44-gateway"
    );
    b44UpdateVenueFact.mockRejectedValueOnce(new ContributionGatewayUnavailable());
    const down = await POST(
      post("http://x/api/venues/c1/facts", { field: "seating", value: "tables" }),
      params,
    );
    expect(down.status).toBe(503);

    b44UpdateVenueFact.mockRejectedValueOnce(new Error("PRIVATE DETAIL"));
    const boom = await POST(
      post("http://x/api/venues/c1/facts", { field: "seating", value: "tables" }),
      params,
    );
    expect(boom.status).toBe(503);
    expect(await boom.text()).not.toContain("PRIVATE DETAIL");
  });
});
