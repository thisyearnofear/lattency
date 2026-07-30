import { describe, it, expect } from "vitest";
import {
  isCuratedCity,
  cityDisplayName,
  resolveCityConfig,
  getLiveCities,
  DEFAULT_CITY_ID,
  CITIES,
} from "@/lib/cities";
import type { CafeStation } from "@/lib/types";

function station(overrides: Partial<CafeStation>): CafeStation {
  return {
    id: "x",
    name: "Test",
    neighbourhood: "Somewhere",
    lat: 0,
    lng: 0,
    tier: "local",
    medianDownMbps: 20,
    medianUpMbps: 5,
    medianLatencyMs: 30,
    medianJitterMs: 0,
    medianLossPct: 0,
    measurementCount: 1,
    latestPhotoUrl: null,
    vibe: "",
    city: "rio-de-janeiro",
    ...overrides,
  };
}

describe("isCuratedCity", () => {
  it("recognizes curated cities", () => {
    expect(isCuratedCity("london")).toBe(true);
    expect(isCuratedCity("nairobi")).toBe(true);
    expect(isCuratedCity("sf")).toBe(true);
  });
  it("rejects arbitrary strings", () => {
    expect(isCuratedCity("rio-de-janeiro")).toBe(false);
    expect(isCuratedCity("")).toBe(false);
  });
});

describe("cityDisplayName", () => {
  it("title-cases hyphenated slugs", () => {
    expect(cityDisplayName("rio-de-janeiro")).toBe("Rio De Janeiro");
    expect(cityDisplayName("sf")).toBe("Sf");
  });
});

describe("resolveCityConfig", () => {
  it("returns the hand-tuned config for curated cities regardless of cafés", () => {
    const config = resolveCityConfig(DEFAULT_CITY_ID, []);
    expect(config).toBe(CITIES[DEFAULT_CITY_ID]);
  });

  it("derives centre, zoom, and bounds from a user city's cafés", () => {
    const cafes = [
      station({ id: "a", neighbourhood: "Centro", lat: -22.9, lng: -43.2, city: "rio-de-janeiro" }),
      station({ id: "b", neighbourhood: "Centro", lat: -22.91, lng: -43.19, city: "rio-de-janeiro" }),
    ];
    const config = resolveCityConfig("rio-de-janeiro", cafes);
    expect(config.name).toBe("Rio De Janeiro");
    expect(config.centre.lat).toBeCloseTo(-22.905, 3);
    expect(config.centre.lng).toBeCloseTo(-43.195, 3);
    expect(config.bounds.south).toBeLessThan(-22.91);
    expect(config.bounds.north).toBeGreaterThan(-22.9);
    expect(config.zoom).toBeGreaterThanOrEqual(9);
  });

  it("derives demo locations from distinct neighbourhoods", () => {
    const cafes = [
      station({ id: "a", neighbourhood: "Centro", lat: -22.9, lng: -43.2, city: "rio-de-janeiro" }),
      station({ id: "b", neighbourhood: "Centro", lat: -22.91, lng: -43.19, city: "rio-de-janeiro" }),
      station({ id: "c", neighbourhood: "Copacabana", lat: -22.97, lng: -43.18, city: "rio-de-janeiro" }),
    ];
    const config = resolveCityConfig("rio-de-janeiro", cafes);
    expect(config.demoLocations.map((d) => d.name)).toEqual(["Centro", "Copacabana"]);
  });
});

describe("getLiveCities", () => {
  it("always includes curated cities in registry order", () => {
    const cities = getLiveCities([]);
    expect(cities.map((c) => c.id)).toEqual(["london", "nairobi", "sf"]);
    expect(cities.every((c) => c.count === 0)).toBe(true);
  });

  it("counts cafés per city and appends user cities", () => {
    const cafes = [
      station({ id: "a", city: "rio-de-janeiro" }),
      station({ id: "b", city: "rio-de-janeiro" }),
      station({ id: "c", city: "london" }),
    ];
    const cities = getLiveCities(cafes);
    const rio = cities.find((c) => c.id === "rio-de-janeiro");
    expect(rio?.count).toBe(2);
    expect(cities.find((c) => c.id === "london")?.count).toBe(1);
    // Curated cities keep their registry position ahead of user cities.
    expect(cities[0].id).toBe("london");
    expect(cities[cities.length - 1].id).toBe("rio-de-janeiro");
  });
});
