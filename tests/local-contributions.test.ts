import { describe, it, expect, beforeEach } from "vitest";
import {
  addLocalCafe,
  addLocalMeasurement,
  getLocalCafes,
  getLocalCafeDetail,
  getExternalReadings,
  __resetLocalContributionsForTests,
} from "@/lib/local-contributions";
import { MOCK_CAFES } from "@/lib/mock-cafes";
import type { MeasurementInput } from "@/lib/types";

function reading(overrides: Partial<MeasurementInput> = {}): MeasurementInput {
  return {
    cafeId: "",
    downMbps: 60,
    upMbps: 20,
    latencyMs: 18,
    measuredAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

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

describe("local-contributions overlay", () => {
  beforeEach(() => {
    __resetLocalContributionsForTests();
  });

  it("creates a café with its first measurement", () => {
    const { cafeId, measurementId } = addLocalCafe(cafeInput, reading(), "manual");
    expect(cafeId).toMatch(/^local-cafe-/);
    expect(measurementId).toMatch(/^local-reading-/);

    const stations = getLocalCafes();
    expect(stations).toHaveLength(1);
    expect(stations[0].name).toBe("Overlay Espresso");
    expect(stations[0].measurementCount).toBe(1);
    expect(stations[0].medianDownMbps).toBe(60);
    expect(stations[0].tier).toBe("express");
  });

  it("builds a detail with distribution + recent from the history", () => {
    const { cafeId } = addLocalCafe(cafeInput, reading({ downMbps: 50 }), "manual");
    addLocalMeasurement(cafeId, reading({ downMbps: 70, measuredAt: "2026-07-01T11:00:00.000Z" }), "manual");

    const detail = getLocalCafeDetail(cafeId);
    expect(detail).not.toBeNull();
    expect(detail?.measurementCount).toBe(2);
    expect(detail?.recent).toHaveLength(2);
    // Newest first.
    expect(detail?.recent[0].downMbps).toBe(70);
    expect(detail?.distribution.length).toBeGreaterThan(0);
  });

  it("rejects measurements for unknown cafés", () => {
    expect(addLocalMeasurement("nope", reading(), "manual")).toBeNull();
  });

  it("accepts readings against a bundled snapshot café", () => {
    const mockCafe = MOCK_CAFES.find((c) => c.measurementCount > 0);
    expect(mockCafe).toBeDefined();
    const id = addLocalMeasurement(mockCafe!.id, reading({ downMbps: 42 }), "manual");
    expect(id).toMatch(/^local-reading-/);
    expect(getExternalReadings(mockCafe!.id)[0].downMbps).toBe(42);
  });

  it("flags an outlier reading against its own history", () => {
    const { cafeId } = addLocalCafe(cafeInput, reading({ downMbps: 50 }), "manual");
    addLocalMeasurement(cafeId, reading({ downMbps: 52 }), "manual");
    addLocalMeasurement(cafeId, reading({ downMbps: 48 }), "manual");
    // 4 clean readings around ~50; a 500 Mbps reading is a >5x outlier and
    // must not move the median.
    addLocalMeasurement(cafeId, reading({ downMbps: 500 }), "manual");

    const detail = getLocalCafeDetail(cafeId);
    expect(detail?.measurementCount).toBe(4);
    expect(detail?.medianDownMbps).toBeLessThan(100);
  });
});
