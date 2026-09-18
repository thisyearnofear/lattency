import { describe, it, expect } from "vitest";
import { deriveSeedProgress } from "@/lib/bounty-progress";
import type { CafeStation, Tier } from "@/lib/types";

/**
 * Minimal station factory. The derivation only reads name, city,
 * neighbourhood, tier, metadata.milkOptions and measurementCount, so the rest
 * of CafeStation is filler — kept in one place so a type change doesn't mean
 * editing every case.
 */
function station(opts: {
  name: string;
  city?: string;
  neighbourhood: string;
  tier?: Tier;
  milk?: string[];
  readings?: number;
}): CafeStation {
  return {
    id: opts.name.toLowerCase().replace(/\s+/g, "-"),
    name: opts.name,
    neighbourhood: opts.neighbourhood,
    city: opts.city ?? "london",
    tier: opts.tier ?? "local",
    medianDownMbps: 40,
    medianUpMbps: 10,
    medianLatencyMs: 20,
    medianJitterMs: 2,
    medianLossPct: 0,
    measurementCount: opts.readings ?? 4,
    latestPhotoUrl: null,
    vibe: "",
    metadata: opts.milk ? { milkOptions: opts.milk } : undefined,
  } as CafeStation;
}

describe("deriveSeedProgress", () => {
  describe("tier-target", () => {
    const criterion = { kind: "tier-target", neighbourhood: "Hoxton", tier: "express" } as const;

    it("counts only the named tier in the named area", () => {
      const stations = [
        station({ name: "A", neighbourhood: "Hoxton", tier: "express" }),
        station({ name: "B", neighbourhood: "Hoxton", tier: "local" }),
        station({ name: "C", neighbourhood: "Shoreditch", tier: "express" }),
      ];

      expect(deriveSeedProgress(criterion, stations)).toBe(1);
    });

    it("matches the neighbourhood case- and punctuation-insensitively", () => {
      const stations = [station({ name: "A", neighbourhood: "HOXTON", tier: "express" })];

      expect(deriveSeedProgress(criterion, stations)).toBe(1);
    });

    it("does not count an adjacent area", () => {
      // Exact matching is deliberate: a criterion is authored against a known
      // place, so a near-miss should read as zero rather than quietly counting
      // stations somewhere else.
      const stations = [
        station({ name: "Hoxton Hotel Lobby", neighbourhood: "Shoreditch", tier: "express" }),
      ];

      expect(deriveSeedProgress(criterion, stations)).toBe(0);
    });

    it("returns the raw count rather than clamping to a target", () => {
      // The caller clamps; the derivation reports what the map actually holds
      // so an over-satisfied criterion stays visible.
      const stations = Array.from({ length: 7 }, (_, i) =>
        station({ name: `E${i}`, neighbourhood: "Hoxton", tier: "express" }),
      );

      expect(deriveSeedProgress(criterion, stations)).toBe(7);
    });
  });

  describe("first-in-neighbourhood", () => {
    it("counts every station in the area regardless of tier", () => {
      const stations = [
        station({ name: "A", neighbourhood: "Eastleigh", tier: "suspended" }),
        station({ name: "B", neighbourhood: "Eastleigh", tier: "express" }),
        station({ name: "C", neighbourhood: "Karen" }),
      ];

      expect(
        deriveSeedProgress(
          { kind: "first-in-neighbourhood", neighbourhood: "Eastleigh" },
          stations,
        ),
      ).toBe(2);
    });
  });

  describe("attribute-match", () => {
    it("counts stations offering the milk option", () => {
      const stations = [
        station({ name: "A", neighbourhood: "Old Street", milk: ["Oat", "Whole"] }),
        station({ name: "B", neighbourhood: "Old Street", milk: ["Whole"] }),
        station({ name: "C", neighbourhood: "Old Street" }),
      ];

      expect(
        deriveSeedProgress(
          { kind: "attribute-match", neighbourhood: "Old Street", milk: "oat" },
          stations,
        ),
      ).toBe(1);
    });

    it("counts nothing when no station carries metadata", () => {
      const stations = [station({ name: "A", neighbourhood: "Old Street" })];

      expect(
        deriveSeedProgress(
          { kind: "attribute-match", neighbourhood: "Old Street", milk: "oat" },
          stations,
        ),
      ).toBe(0);
    });
  });

  describe("nth-contributor", () => {
    it("sums readings across a neighbourhood", () => {
      const stations = [
        station({ name: "A", neighbourhood: "Bethnal Green", readings: 3 }),
        station({ name: "B", neighbourhood: "Bethnal Green", readings: 4 }),
        station({ name: "C", neighbourhood: "Shoreditch", readings: 9 }),
      ];

      expect(
        deriveSeedProgress({ kind: "nth-contributor", neighbourhood: "Bethnal Green" }, stations),
      ).toBe(7);
    });

    it("sums readings at a named venue", () => {
      const stations = [
        station({ name: "Savanna Coffee Lounge", neighbourhood: "CBD", city: "nairobi", readings: 4 }),
        station({ name: "Java House", neighbourhood: "CBD", city: "nairobi", readings: 9 }),
      ];

      expect(
        deriveSeedProgress({ kind: "nth-contributor", cafeName: "Savanna Coffee Lounge" }, stations),
      ).toBe(4);
    });

    it("matches a decorated venue name", () => {
      // Station names sometimes carry a branch suffix, so the criterion name
      // is treated as a substring rather than an exact key.
      const stations = [
        station({ name: "Savanna Coffee Lounge — CBD", neighbourhood: "CBD", readings: 6 }),
      ];

      expect(
        deriveSeedProgress({ kind: "nth-contributor", cafeName: "Savanna Coffee Lounge" }, stations),
      ).toBe(6);
    });

    it("compares accented names in either direction", () => {
      // The bundled catalog contains "Réveille Coffee"; a criterion written in
      // plain ASCII must still find it.
      const stations = [station({ name: "Réveille Coffee", neighbourhood: "Hayes Valley", readings: 5 })];

      expect(
        deriveSeedProgress({ kind: "nth-contributor", cafeName: "Reveille Coffee" }, stations),
      ).toBe(5);
    });

    it("treats a missing measurementCount as zero", () => {
      const bare = { ...station({ name: "A", neighbourhood: "Bethnal Green" }), measurementCount: undefined };

      expect(
        deriveSeedProgress(
          { kind: "nth-contributor", neighbourhood: "Bethnal Green" },
          [bare as unknown as CafeStation],
        ),
      ).toBe(0);
    });
  });

  it("scopes to a city when one is given", () => {
    // Two cities can share a neighbourhood name; seeds carry a city id so the
    // London board never counts Nairobi stations.
    const stations = [
      station({ name: "A", city: "london", neighbourhood: "CBD", tier: "express" }),
      station({ name: "B", city: "nairobi", neighbourhood: "CBD", tier: "express" }),
    ];

    expect(
      deriveSeedProgress({ kind: "tier-target", neighbourhood: "CBD", tier: "express" }, stations),
    ).toBe(2);
    expect(
      deriveSeedProgress(
        { kind: "tier-target", neighbourhood: "CBD", tier: "express" },
        stations,
        "nairobi",
      ),
    ).toBe(1);
  });
});
