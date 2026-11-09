import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MOCK_CAFES } from "@/lib/mock-cafes";
import { CafeDataUnavailableError } from "@/lib/cafe-data-status";
import { slugify } from "@/lib/slug";
import { addLocalCafe, __resetLocalContributionsForTests } from "@/lib/local-contributions";
import type { CafeStation, MeasurementInput } from "@/lib/types";

const mockConfig = { base44Configured: false };
const b44ListCafes = vi.fn();
const b44GetCafeById = vi.fn();

vi.mock("@/lib/base44-data", () => ({
  get base44Configured() {
    return mockConfig.base44Configured;
  },
  b44ListCafes: (...args: unknown[]) => b44ListCafes(...args),
  b44GetCafeById: (...args: unknown[]) => b44GetCafeById(...args),
}));

const cafeInput = {
  name: "Overlay Espresso",
  neighbourhood: "Testville",
  lat: 51.52,
  lng: -0.08,
  city: "london",
  vibe: "cozy",
  venueType: "cafe" as const,
  metadata: {},
  photoUrl: "data:image/jpeg;base64,AAAA",
};

function reading(): MeasurementInput {
  return {
    cafeId: "",
    downMbps: 60,
    upMbps: 20,
    latencyMs: 18,
  };
}

const liveStation: CafeStation = {
  id: "b44-cafe-1",
  name: "Live Beans",
  neighbourhood: "Soho",
  lat: 51.51,
  lng: -0.13,
  tier: "express",
  medianDownMbps: 80,
  medianUpMbps: 25,
  medianLatencyMs: 10,
  medianJitterMs: 0,
  medianLossPct: 0,
  measurementCount: 3,
  latestPhotoUrl: null,
  vibe: "buzzy",
  city: "london",
};

describe("café read provenance", () => {
  beforeEach(() => {
    mockConfig.base44Configured = false;
    b44ListCafes.mockReset().mockResolvedValue([]);
    b44GetCafeById.mockReset().mockResolvedValue(null);
    __resetLocalContributionsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("configured backend returning an empty network yields an empty network, not demo data", async () => {
    mockConfig.base44Configured = true;
    b44ListCafes.mockResolvedValue([]);
    const { getCafes } = await import("@/lib/cafes");
    await expect(getCafes({ city: "london" })).resolves.toEqual([]);
  });

  it("configured backend failure rejects with CafeDataUnavailableError", async () => {
    mockConfig.base44Configured = true;
    b44ListCafes.mockRejectedValue(new Error("backend down"));
    const { getCafes } = await import("@/lib/cafes");
    await expect(getCafes({ city: "london" })).rejects.toBeInstanceOf(
      CafeDataUnavailableError,
    );
  });

  it("configured backend returning null detail for a known demo id yields null", async () => {
    mockConfig.base44Configured = true;
    b44GetCafeById.mockResolvedValue(null);
    const { getCafeById } = await import("@/lib/cafes");
    await expect(getCafeById(MOCK_CAFES[0].id)).resolves.toBeNull();
  });

  it("configured backend detail failure rejects with CafeDataUnavailableError", async () => {
    mockConfig.base44Configured = true;
    b44GetCafeById.mockRejectedValue(new Error("backend down"));
    const { getCafeById } = await import("@/lib/cafes");
    await expect(getCafeById(MOCK_CAFES[0].id)).rejects.toBeInstanceOf(
      CafeDataUnavailableError,
    );
  });

  it("configured backend does not resolve slugs against the bundled snapshot", async () => {
    mockConfig.base44Configured = true;
    b44ListCafes.mockResolvedValue([]);
    const { getCafeBySlug } = await import("@/lib/cafes");
    await expect(
      getCafeBySlug(slugify(MOCK_CAFES[0].name)),
    ).resolves.toBeNull();
  });

  it("unconfigured demo stations are tagged dataSource demo", async () => {
    const { getCafes } = await import("@/lib/cafes");
    const cafes = await getCafes({ city: "london" });
    const known = cafes.find((c) => c.id === MOCK_CAFES[0].id);
    expect(known).toBeDefined();
    expect(known!.dataSource).toBe("demo");
    expect(cafes.every((c) => c.dataSource === "demo" || c.dataSource === "local")).toBe(true);
  });

  it("unconfigured locally-created cafés are tagged dataSource local", async () => {
    const { cafeId } = addLocalCafe(cafeInput, reading(), "manual");
    const { getCafes, getCafeById } = await import("@/lib/cafes");
    const cafes = await getCafes({ city: "london" });
    const created = cafes.find((c) => c.id === cafeId);
    expect(created).toBeDefined();
    expect(created!.dataSource).toBe("local");
    const detail = await getCafeById(cafeId);
    expect(detail!.dataSource).toBe("local");
  });

  it("configured backend stations are tagged dataSource community", async () => {
    mockConfig.base44Configured = true;
    b44ListCafes.mockResolvedValue([liveStation]);
    const { getCafes } = await import("@/lib/cafes");
    const cafes = await getCafes({ city: "london" });
    expect(cafes).toHaveLength(1);
    expect(cafes[0].dataSource).toBe("community");
  });

  it("demo recent readings are stable regardless of the current clock", async () => {
    const { getCafeById } = await import("@/lib/cafes");
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-01-01T00:00:00Z"));
    const a = await getCafeById(MOCK_CAFES[0].id);
    vi.setSystemTime(Date.parse("2027-06-15T08:30:00Z"));
    const b = await getCafeById(MOCK_CAFES[0].id);
    expect(a!.recent.map((r) => r.measuredAt)).toEqual(
      b!.recent.map((r) => r.measuredAt),
    );
    expect(a!.dataSource).toBe("demo");
  });
});
