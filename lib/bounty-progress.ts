// Seed-bounty progress — derived from the map rather than stored.
//
// The bundled bounty snapshot exists so the mechanic is visible before the
// first sponsor arrives. Its progress used to be a hardcoded number, which
// made the board a still image: it could claim "3 express-tier cafés around
// Hoxton" while the map behind it showed none, and the number never moved as
// people contributed. Worse, those literals were authored against the seed
// data of the time, so they silently became fiction.
//
// This module recomputes each seed's progress from the stations that actually
// exist. Because a derived number can't be authored wrong, the criterion is
// stored as structured data next to the seed (`SEED_CRITERIA` in
// lib/bounties.ts) and each seed's goal prose names that criterion exactly —
// "3 express-tier cafés **in Hoxton**" is the count of express-tier stations
// in Hoxton. Prose and number can't disagree.
//
// Seed bounties are unfunded (see `Bounty.synthetic`). Deriving their progress
// is what makes them useful — they read as real, open gaps in the map — but it
// must never be mistaken for a payout: an unfunded bounty that reaches its
// target has no money behind it, and every payout-adjacent surface checks
// `synthetic` before promising anything.
//
// Pure: no DB, no SDK, no clock. Callers supply the stations.

import type { CafeStation, Tier } from "./types";

/**
 * What a seed bounty counts. Mirrors `BountyKind` one-to-one — the criterion
 * kind is the bounty kind, so there is no mapping to drift.
 */
export type SeedCriterion =
  /** Stations mapped in a neighbourhood. The "first in area" objective. */
  | { kind: "first-in-neighbourhood"; neighbourhood: string }
  /** Stations in a neighbourhood at a specific tier. */
  | { kind: "tier-target"; neighbourhood: string; tier: Tier }
  /** Stations in a neighbourhood offering a given milk option. */
  | { kind: "attribute-match"; neighbourhood: string; milk: string }
  /**
   * Total readings, either across a neighbourhood or at one named venue.
   * Counts measurements rather than stations — "the 10th verified test" is
   * about readings, not venues.
   */
  | { kind: "nth-contributor"; neighbourhood?: string; cafeName?: string };

/**
 * Case-, accent- and punctuation-insensitive form for comparison.
 *
 * Accents matter here: the bundled catalog contains "Réveille Coffee" and the
 * vocabulary uses "café", so a criterion written in plain ASCII must still
 * match an accented station name (and vice versa).
 */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inNeighbourhood(station: CafeStation, neighbourhood: string): boolean {
  return normalize(station.neighbourhood) === normalize(neighbourhood);
}

function inCity(station: CafeStation, city?: string): boolean {
  return !city || normalize(station.city) === normalize(city);
}

function hasMilk(station: CafeStation, milk: string): boolean {
  const want = normalize(milk);
  return (station.metadata?.milkOptions ?? []).some((m) => normalize(m) === want);
}

/**
 * Count what a seed criterion describes.
 *
 * Returns the raw count — deliberately not clamped to the bounty's target, so
 * a criterion that is over-satisfied stays visible to the caller. Neighbourhood
 * matching is exact (after normalization) rather than fuzzy: a criterion is
 * authored against a known place, so a near-miss should read as zero instead of
 * silently counting stations in an adjacent area.
 */
export function deriveSeedProgress(
  criterion: SeedCriterion,
  stations: CafeStation[],
  city?: string,
): number {
  const scope = stations.filter((s) => inCity(s, city));

  switch (criterion.kind) {
    case "first-in-neighbourhood":
      return scope.filter((s) => inNeighbourhood(s, criterion.neighbourhood)).length;

    case "tier-target":
      return scope.filter(
        (s) => inNeighbourhood(s, criterion.neighbourhood) && s.tier === criterion.tier,
      ).length;

    case "attribute-match":
      return scope.filter(
        (s) => inNeighbourhood(s, criterion.neighbourhood) && hasMilk(s, criterion.milk),
      ).length;

    case "nth-contributor": {
      // A named venue scopes to that venue; otherwise the whole neighbourhood.
      // Contains-matching on the name so "Savanna Coffee Lounge" also matches a
      // station stored as "Savanna Coffee Lounge — CBD".
      const needle = criterion.cafeName ? normalize(criterion.cafeName) : null;
      return scope
        .filter((s) =>
          needle
            ? normalize(s.name).includes(needle)
            : inNeighbourhood(s, criterion.neighbourhood ?? ""),
        )
        .reduce((total, s) => total + Math.max(0, s.measurementCount ?? 0), 0);
    }
  }
}
