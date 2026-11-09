import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_CAFES } from "@/lib/mock-cafes";

const getCafes = vi.fn();
const getCafeById = vi.fn();
const mockConfig = { base44Configured: false };

vi.mock("@/lib/cafes", () => ({
  getCafes: (...args: unknown[]) => getCafes(...args),
  getCafeById: (...args: unknown[]) => getCafeById(...args),
}));

vi.mock("@/lib/base44", () => ({
  get base44Configured() {
    return mockConfig.base44Configured;
  },
}));

const PRIVATE = "PRIVATE BACKEND DETAIL";

function get(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

describe("café read API failure surfaces", () => {
  beforeEach(() => {
    mockConfig.base44Configured = false;
    getCafes.mockReset().mockRejectedValue(new Error(PRIVATE));
    getCafeById.mockReset().mockRejectedValue(new Error(PRIVATE));
  });

  it("GET /api/cafes/near (coordinates) returns 503 without leaking backend detail", async () => {
    const { GET } = await import("@/app/api/cafes/near/route");
    const res = await GET(
      get("http://localhost/api/cafes/near?lat=51.5&lng=-0.1&radius=2000"),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(text).not.toContain(PRIVATE);
  });

  it("GET /api/cafes/near (no coordinates) returns 503 without leaking backend detail", async () => {
    const { GET } = await import("@/app/api/cafes/near/route");
    const res = await GET(get("http://localhost/api/cafes/near?city=london"));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).not.toContain(PRIVATE);
  });

  it("GET /api/cafes/[id] returns 503 without leaking backend detail", async () => {
    const { GET } = await import("@/app/api/cafes/[id]/route");
    const res = await GET(get("http://localhost/api/cafes/abc"), {
      params: Promise.resolve({ id: "b44-cafe-1234" }),
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).not.toContain(PRIVATE);
  });

  it("GET /api/network returns 503 without leaking backend detail", async () => {
    const { GET } = await import("@/app/api/network/route");
    const res = await GET(get("http://localhost/api/network"));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).not.toContain(PRIVATE);
  });

  it("GET /api/llm returns 503 without leaking backend detail", async () => {
    const { GET } = await import("@/app/api/llm/route");
    const res = await GET(get("http://localhost/api/llm?city=london"));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).not.toContain(PRIVATE);
  });

  it("GET /api/cafes/near returns 200 with a valid empty network", async () => {
    getCafes.mockResolvedValue([]);
    const { GET } = await import("@/app/api/cafes/near/route");
    const res = await GET(get("http://localhost/api/cafes/near?city=london"));
    expect(res.status).toBe(200);
    expect((await res.json()).cafes).toEqual([]);
  });

  it("GET /api/network returns 200 with a valid empty network", async () => {
    getCafes.mockResolvedValue([]);
    const { GET } = await import("@/app/api/network/route");
    const res = await GET(get("http://localhost/api/network"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stations: unknown[] };
    expect(body.stations).toEqual([]);
  });

  it("includes metric definitions in every NDJSON station", async () => {
    getCafes.mockResolvedValue([MOCK_CAFES[0]]);
    const { GET } = await import("@/app/api/network/route");
    const res = await GET(get("http://localhost/api/network?format=ndjson"));
    const station = JSON.parse((await res.text()).trim());
    expect(station.metricDefinitions).toEqual({
      latencyMs: "HTTP round-trip time",
      jitterMs: "HTTP round-trip variation (legacy field name)",
      lossPct: "HTTP request failure percentage (legacy field name)",
    });
  });

  it("GET /api/llm reports the demo source truthfully when unconfigured", async () => {
    mockConfig.base44Configured = false;
    getCafes.mockResolvedValue([]);
    const { GET } = await import("@/app/api/llm/route");
    const res = await GET(get("http://localhost/api/llm?city=london"));
    const text = await res.text();
    expect(text).toContain("Demo mode: sample metrics");
  });

  it("GET /api/llm reports community provenance when configured", async () => {
    mockConfig.base44Configured = true;
    getCafes.mockResolvedValue([]);
    const { GET } = await import("@/app/api/llm/route");
    const res = await GET(get("http://localhost/api/llm?city=london"));
    const text = await res.text();
    expect(text).toContain("Community reports; not independently verified.");
    expect(text).not.toContain("Demo mode");
  });
});
