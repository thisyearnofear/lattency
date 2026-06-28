import { query } from "./db";
import type { CafeDetail, CafeStation, Neighbourhood, Tier, TimeBucket } from "./types";

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
  };
}

interface GetCafesOptions {
  /** Filter by ST_DWithin if all three provided. */
  lat?: number;
  lng?: number;
  radiusM?: number;
}

/**
 * Returns cafés with tier + median speeds + latest photo.
 * Without coordinates → returns the whole network. With → ST_DWithin filter.
 * Result order: by distance ascending when filtered, by name otherwise.
 */
export async function getCafes(opts: GetCafesOptions = {}): Promise<CafeStation[]> {
  const { lat, lng, radiusM } = opts;
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
  const result = await query<CafeRow>(sql, params);
  return result.rows.map(rowToStation);
}

interface DistributionRow {
  time_bucket: TimeBucket;
  median_down_mbps: string | number;
  sample_size: string | number;
}

/**
 * Single café detail with per–time-bucket distribution.
 */
export async function getCafeById(id: string): Promise<CafeDetail | null> {
  const [statsResult, distResult] = await Promise.all([
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

  const stationRow = statsResult.rows[0];
  if (!stationRow) return null;
  const station = rowToStation(stationRow);

  const distribution = distResult.rows.map((r) => ({
    timeBucket: r.time_bucket,
    medianDownMbps: Number(r.median_down_mbps),
    sampleSize: Number(r.sample_size),
  }));

  return { ...station, distribution };
}
