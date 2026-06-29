import type { QueryResult } from "pg";
import { query } from "./db";
import { MOCK_CAFES } from "./mock-cafes";
import type { CafeDetail, CafeStation, Neighbourhood, Tier, TimeBucket } from "./types";

// ── Demo-safety fallback ──────────────────────────────────────────────────────
// Aurora Serverless v2 auto-pauses at 0 ACU and the first cold connection can
// take 15-30s (see lib/db.ts) — or fail outright if the IP allowlist is stale.
// For a public hackathon link and a recorded demo, a white-screen is fatal, so
// every read degrades gracefully to the bundled Nairobi snapshot. The snapshot
// is shaped identically to the live rows, so the UI is byte-for-byte the same.
// We log loudly so a real outage is still observable in Vercel logs.

function warnFallback(scope: string, err: unknown): void {
  const reason = err instanceof Error ? err.message : String(err);
  console.warn(`[lattency] ${scope}: serving bundled snapshot (Aurora unavailable: ${reason})`);
}

// Haversine distance in metres — lets the geo filter work against the snapshot
// when Aurora is unreachable, mirroring ST_DWithin / ST_Distance ordering.
function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fallbackCafes(opts: GetCafesOptions): CafeStation[] {
  const { lat, lng, radiusM, city } = opts;
  // City filter — default to Nairobi for back-compat with callers that
  // don't pass a city (e.g. the existing home + tour routes).
  const wantedCity = city ?? "nairobi";
  const cityCafes = MOCK_CAFES.filter((c) => c.city === wantedCity);
  if (lat !== undefined && lng !== undefined && radiusM !== undefined) {
    const origin = { lat, lng };
    return cityCafes
      .map((c) => ({ c, d: distanceMetres(origin, c) }))
      .filter(({ d }) => d <= radiusM)
      .sort((a, b) => a.d - b.d)
      .map(({ c }) => c);
  }
  return [...cityCafes].sort((a, b) => a.name.localeCompare(b.name));
}

// Raw row shape from cafe_speed_stats + latest-photo lateral join.
interface CafeRow {
  id: string;
  name: string;
  neighbourhood: Neighbourhood;
  lat: string | number;
  lng: string | number;
  vibe: string | null;
  tier: Tier;
  median_down_mbps: string | number;
  median_up_mbps: string | number;
  median_latency_ms: string | number;
  measurement_count: string | number;
  latest_photo_url: string | null;
}

function rowToStation(r: CafeRow): CafeStation {
  return {
    id: r.id,
    name: r.name,
    neighbourhood: r.neighbourhood,
    lat: Number(r.lat),
    lng: Number(r.lng),
    tier: r.tier,
    medianDownMbps: Number(r.median_down_mbps),
    medianUpMbps: Number(r.median_up_mbps),
    medianLatencyMs: Number(r.median_latency_ms),
    measurementCount: Number(r.measurement_count),
    latestPhotoUrl: r.latest_photo_url,
    vibe: r.vibe ?? "",
    // Aurora rows are Nairobi-only for now. When we migrate the schema to
    // multi-city this defaults to whatever the row says.
    city: "nairobi",
  };
}

interface GetCafesOptions {
  /** Filter by ST_DWithin if all three provided. */
  lat?: number;
  lng?: number;
  radiusM?: number;
  /** Filter by city. Defaults to 'nairobi' (the DB-backed city).
   *  Any other city is served entirely from MOCK_CAFES — the DB doesn't
   *  have multi-city rows yet. */
  city?: CafeStation["city"];
}

/**
 * Returns cafés with tier + median speeds + latest photo.
 * Without coordinates → returns the whole network. With → ST_DWithin filter.
 * Result order: by distance ascending when filtered, by name otherwise.
 */
export async function getCafes(opts: GetCafesOptions = {}): Promise<CafeStation[]> {
  const { lat, lng, radiusM, city } = opts;
  // Non-Nairobi cities live in MOCK_CAFES only — the schema doesn't have a
  // city column yet. Short-circuit the DB call entirely for those.
  if (city && city !== "nairobi") {
    return fallbackCafes({ ...opts });
  }
  const geoFiltered = lat !== undefined && lng !== undefined && radiusM !== undefined;

  const sql = geoFiltered
    ? `
      SELECT
        cs.cafe_id AS id,
        cs.name,
        cs.neighbourhood,
        cs.lat,
        cs.lng,
        cs.vibe,
        cs.tier,
        cs.median_down_mbps,
        cs.median_up_mbps,
        cs.median_latency_ms,
        cs.measurement_count,
        lp.photo_url AS latest_photo_url
      FROM cafe_speed_stats cs
      JOIN cafes c ON c.id = cs.cafe_id
      LEFT JOIN LATERAL (
        SELECT photo_url
        FROM measurements m
        WHERE m.cafe_id = cs.cafe_id AND m.photo_url IS NOT NULL
        ORDER BY m.measured_at DESC
        LIMIT 1
      ) lp ON TRUE
      WHERE ST_DWithin(
        c.location,
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
        $3
      )
      ORDER BY ST_Distance(
        c.location,
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
      ) ASC
    `
    : `
      SELECT
        cs.cafe_id AS id,
        cs.name,
        cs.neighbourhood,
        cs.lat,
        cs.lng,
        cs.vibe,
        cs.tier,
        cs.median_down_mbps,
        cs.median_up_mbps,
        cs.median_latency_ms,
        cs.measurement_count,
        lp.photo_url AS latest_photo_url
      FROM cafe_speed_stats cs
      LEFT JOIN LATERAL (
        SELECT photo_url
        FROM measurements m
        WHERE m.cafe_id = cs.cafe_id AND m.photo_url IS NOT NULL
        ORDER BY m.measured_at DESC
        LIMIT 1
      ) lp ON TRUE
      ORDER BY cs.name ASC
    `;

  const params = geoFiltered ? [lat, lng, radiusM] : [];
  try {
    const result = await query<CafeRow>(sql, params);
    // An empty result usually means an un-seeded cluster in a fresh env; the
    // demo should still show the network, so treat empty as a fallback too.
    if (result.rows.length === 0) return fallbackCafes(opts);
    return result.rows.map(rowToStation);
  } catch (err) {
    warnFallback("getCafes", err);
    return fallbackCafes(opts);
  }
}

interface DistributionRow {
  time_bucket: TimeBucket;
  median_down_mbps: string | number;
  sample_size: string | number;
}

// Synthesizes a believable morning/afternoon/evening curve from a single
// median, used when Aurora is unreachable. Afternoons sag (everyone's online),
// mornings are fastest — the same shape the seed data produces.
function fallbackDetail(id: string): CafeDetail | null {
  const station = MOCK_CAFES.find((c) => c.id === id);
  if (!station) return null;
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
  return { ...station, distribution };
}

/**
 * Single café detail with per–time-bucket distribution.
 */
export async function getCafeById(id: string): Promise<CafeDetail | null> {
  let statsResult: QueryResult<CafeRow>;
  let distResult: QueryResult<DistributionRow>;
  try {
    [statsResult, distResult] = await Promise.all([
    query<CafeRow>(
      `
      SELECT
        cs.cafe_id AS id,
        cs.name,
        cs.neighbourhood,
        cs.lat,
        cs.lng,
        cs.vibe,
        cs.tier,
        cs.median_down_mbps,
        cs.median_up_mbps,
        cs.median_latency_ms,
        cs.measurement_count,
        lp.photo_url AS latest_photo_url
      FROM cafe_speed_stats cs
      LEFT JOIN LATERAL (
        SELECT photo_url
        FROM measurements m
        WHERE m.cafe_id = cs.cafe_id AND m.photo_url IS NOT NULL
        ORDER BY m.measured_at DESC
        LIMIT 1
      ) lp ON TRUE
      WHERE cs.cafe_id = $1
      `,
      [id],
    ),
    query<DistributionRow>(
      `
      SELECT
        time_bucket,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY down_mbps) AS median_down_mbps,
        COUNT(*) AS sample_size
      FROM measurements
      WHERE cafe_id = $1
      GROUP BY time_bucket
      ORDER BY CASE time_bucket
        WHEN 'morning' THEN 1
        WHEN 'afternoon' THEN 2
        WHEN 'evening' THEN 3
      END
      `,
      [id],
    ),
    ]);
  } catch (err) {
    warnFallback("getCafeById", err);
    return fallbackDetail(id);
  }

  const stationRow = statsResult.rows[0];
  if (!stationRow) return fallbackDetail(id);
  const station = rowToStation(stationRow);

  const distribution = distResult.rows.map((r) => ({
    timeBucket: r.time_bucket,
    medianDownMbps: Number(r.median_down_mbps),
    sampleSize: Number(r.sample_size),
  }));

  return { ...station, distribution };
}

/**
 * Resolves a slug like "about-thyme" to a full CafeDetail by name match.
 * Slugs are derived from names (see lib/slug.ts) so there's nothing to store.
 */
import { slugify } from "./slug";

export async function getCafeBySlug(slug: string): Promise<CafeDetail | null> {
  const cafes = await getCafes();
  const station = cafes.find((c) => slugify(c.name) === slug);
  if (!station) return null;
  return getCafeById(station.id);
}
