// Café read path. Base44 is the live backend; when it is unconfigured (or
// cold) we fall through to the bundled snapshot plus any cafés/readings
// created in this process via the mock-mode write overlay. The map never
// white-screens: every function returns a value on every path.

import { MOCK_CAFES } from "./mock-cafes";
import { haversineKm } from "./geo";
import { DEFAULT_CITY_ID } from "./cities";
import {
  base44Configured,
  b44ListCafes,
  b44GetCafeById,
} from "./base44-data";
import {
  getLocalCafes,
  getLocalCafeDetail,
  getExternalReadings,
} from "./local-contributions";
import { slugify } from "./slug";
import { log } from "./log";
import type { CafeDetail, CafeStation, TimeBucket } from "./types";

function warnFallback(scope: string, err: unknown): void {
  const reason = err instanceof Error ? err.message : String(err);
  log.warn("serving bundled snapshot (Base44 unavailable)", {
    scope: `cafes.${scope}`,
    reason,
  });
}

interface GetCafesOptions {
  /** Filter by distance from a point if all three provided. */
  lat?: number;
  lng?: number;
  radiusM?: number;
  /** Filter by city. Defaults to the curated default city. */
  city?: CafeStation["city"];
  /** Return all cafés from all cities (ignores the city filter). */
  all?: boolean;
}

// Backfill for the snapshot path: the bundled catalog carries vibe_tags,
// and the seeded café names match one-to-one, so we key the chips by name
// to keep MOCK_CAFES the single source of truth for the vocabulary.
const VIBE_TAGS_BY_NAME: Map<string, string[]> = new Map(
  MOCK_CAFES.map((c) => [c.name, c.vibeTags ?? []]),
);

/**
 * Returns cafés with tier + median speeds + latest photo + metadata.
 * Without coordinates → the whole network for the city. With → distance
 * filter, nearest first.
 *
 * Order: Base44 (live) → local overlay (this process) → bundled snapshot.
 */
export async function getCafes(opts: GetCafesOptions = {}): Promise<CafeStation[]> {
  const { lat, lng, radiusM, city, all } = opts;

  if (base44Configured) {
    try {
      const cafes = await b44ListCafes({
        city: all ? undefined : (city ?? DEFAULT_CITY_ID),
        lat,
        lng,
        radiusM,
      });
      if (cafes.length > 0) return cafes;
    } catch (err) {
      warnFallback("getCafes.base44", err);
    }
  }

  // Snapshot path: merge the bundled catalog with anything created in this
  // process, then apply the same city/geo filter the live path would.
  const wantedCity = city ?? DEFAULT_CITY_ID;
  const merged = all
    ? [...MOCK_CAFES, ...getLocalCafes()]
    : [
        ...MOCK_CAFES.filter((c) => c.city === wantedCity),
        ...getLocalCafes().filter((c) => c.city === wantedCity),
      ].map((c) =>
        c.id.startsWith("local-") ? c : { ...c, vibeTags: VIBE_TAGS_BY_NAME.get(c.name) ?? [] },
      );

  if (lat !== undefined && lng !== undefined && radiusM !== undefined) {
    const origin = { lat, lng };
    const radiusKm = radiusM / 1000;
    return merged
      .map((c) => ({ c, d: haversineKm(origin, c) }))
      .filter(({ d }) => d <= radiusKm)
      .sort((a, b) => a.d - b.d)
      .map(({ c }) => c);
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

// Deterministic 32-bit hash of a string — seeds the mock "recent readings"
// synthesis so the same café renders the same trail across server + client,
// while still feeling fresh each minute (timestamps anchor to Date.now()).
function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Tiny LCG seeded from the café id — same id, same sequence. We only need a
// handful of [0,1) draws per café, so cryptographic quality is irrelevant.
function makeRand(seed: number): () => number {
  let s = (seed || 1) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function synthesizeRecent(
  id: string,
  medianDownMbps: number,
): CafeDetail["recent"] {
  const rand = makeRand(fnv1a(id));
  const now = Date.now();
  // Five readings, spaced across the last ~22 hours but biased toward the
  // recent end so the ticker always has a "minutes ago" entry up top.
  const offsetsMinutes = [
    Math.round(2 + rand() * 6),
    Math.round(18 + rand() * 35),
    Math.round(95 + rand() * 90),
    Math.round(360 + rand() * 240),
    Math.round(900 + rand() * 360),
  ];
  return offsetsMinutes.map((mins) => {
    const variance = 0.85 + rand() * 0.3;
    return {
      measuredAt: new Date(now - mins * 60_000).toISOString(),
      downMbps: Math.max(1, Math.round(medianDownMbps * variance * 10) / 10),
    };
  });
}

// Synthesizes a believable morning/afternoon/evening curve from a single
// median for the snapshot path. Afternoons sag (everyone's online), mornings
// are fastest. When measurementCount === 0 (e.g. SF reputation tiers) we
// return an empty distribution so the UI shows a clean "no data yet" state
// rather than fabricating one.
function snapshotDetail(id: string): CafeDetail | null {
  const station = MOCK_CAFES.find((c) => c.id === id);
  if (!station) return null;

  // Readings logged against this snapshot café in this process ride on top
  // of the synthesized trail, newest first.
  const extras = getExternalReadings(id);

  if (station.measurementCount === 0) {
    return { ...station, distribution: [], recent: extras };
  }
  const base = station.medianDownMbps;
  const shape: Array<{ timeBucket: TimeBucket; factor: number }> = [
    { timeBucket: "morning", factor: 1.12 },
    { timeBucket: "afternoon", factor: 0.82 },
    { timeBucket: "evening", factor: 1.02 },
  ];
  const distribution = shape.map(({ timeBucket, factor }) => ({
    timeBucket,
    medianDownMbps: Math.max(1, Math.round(base * factor * 10) / 10),
    sampleSize: Math.max(1, Math.round(station.measurementCount / 3)),
  }));
  return {
    ...station,
    distribution,
    recent: [...extras, ...synthesizeRecent(id, base)].slice(0, 5),
  };
}

/**
 * Single café detail with per–time-bucket distribution and recent readings.
 */
export async function getCafeById(id: string): Promise<CafeDetail | null> {
  // A café created in this process always wins — the overlay is the source
  // of truth for its own reads in mock mode.
  const local = getLocalCafeDetail(id);
  if (local) return local;

  if (base44Configured) {
    try {
      const detail = await b44GetCafeById(id);
      if (detail) return detail;
    } catch (err) {
      warnFallback("getCafeById.base44", err);
    }
  }

  return snapshotDetail(id);
}

/**
 * Resolves a slug like "about-thyme" to a full CafeDetail by name match.
 * Searches every café — live, local overlay, and snapshot — so user-generated
 * cafés in any city resolve. Slugs derive from names (see lib/slug.ts), so
 * there's nothing extra to store.
 */
export async function getCafeBySlug(slug: string): Promise<CafeDetail | null> {
  const allCafes = await getCafes({ all: true });
  const station = allCafes.find((c) => slugify(c.name) === slug);
  if (station) return getCafeById(station.id);

  const mockStation = MOCK_CAFES.find((c) => slugify(c.name) === slug);
  if (mockStation) return getCafeById(mockStation.id);

  return null;
}
