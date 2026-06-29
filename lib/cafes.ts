import type { QueryResult } from "pg";
import { query } from "./db";
import { MOCK_CAFES } from "./mock-cafes";
import type { CafeDetail, CafeStation, Neighbourhood, Sponsor, Tier, TimeBucket } from "./types";
import { log } from "./log";

// ── Demo-safety fallback ──────────────────────────────────────────────────────
// Aurora Serverless v2 auto-pauses at 0 ACU and the first cold connection can
// take 15-30s (see lib/db.ts) — or fail outright if the IP allowlist is stale.
// For a public hackathon link and a recorded demo, a white-screen is fatal, so
// every read degrades gracefully to the bundled Nairobi snapshot. The snapshot
// is shaped identically to the live rows, so the UI is byte-for-byte the same.
// We log loudly so a real outage is still observable in Vercel logs.

function warnFallback(scope: string, err: unknown): void {
  const reason = err instanceof Error ? err.message : String(err);
  log.warn("serving bundled snapshot (Aurora unavailable)", {
    scope: `cafes.${scope}`,
    reason,
  });
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
  city: string | null;
  price_tier: string | null;
  milk_options: string[] | null;
  power_outlets: boolean | null;
  seating: string | null;
  wifi_network: string | null;
  /** Optional because the LIST_COLUMNS query intentionally omits this
   *  field. Detail queries always include it. */
  photo_url?: string | null;
  median_down_mbps: string | number;
  median_up_mbps: string | number;
  median_latency_ms: string | number;
  median_jitter_ms: string | number;
  median_loss_pct: string | number;
  measurement_count: string | number;
  latest_photo_url: string | null;
  /** Active sponsor (LEFT JOIN sponsorships in the MV); all three columns
   *  are null together when no sponsor is attached. */
  sponsor_name: string | null;
  sponsor_kind: string | null;
  sponsor_tagline: string | null;
}

// Backfill for Aurora-backed rows: the DB doesn't carry vibe_tags yet, but
// the seeded café names match the mock catalog one-to-one (see seeds/0001*).
// Looking up tags by name keeps MOCK_CAFES as the single source of truth
// for the chip vocabulary without needing a migration.
const VIBE_TAGS_BY_NAME: Map<string, string[]> = new Map(
  MOCK_CAFES.map((c) => [c.name, c.vibeTags ?? []]),
);

function rowToSponsor(r: CafeRow): Sponsor | null {
  if (!r.sponsor_name || !r.sponsor_kind) return null;
  return {
    name: r.sponsor_name,
    kind: r.sponsor_kind as Sponsor["kind"],
    tagline: r.sponsor_tagline,
  };
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
    medianJitterMs: Number(r.median_jitter_ms),
    medianLossPct: Number(r.median_loss_pct),
    measurementCount: Number(r.measurement_count),
    // List queries drop cs.photo_url for bandwidth; detail queries keep it.
    // Either way the contributor photo is only meaningful on detail pages,
    // and the list view's `latestPhotoUrl` is the external measurement URL.
    latestPhotoUrl: r.latest_photo_url ?? r.photo_url ?? null,
    vibe: r.vibe ?? "",
    vibeTags: VIBE_TAGS_BY_NAME.get(r.name) ?? [],
    city: r.city ?? "nairobi",
    metadata: {
      priceTier: (r.price_tier as "budget" | "mid" | "premium") ?? undefined,
      milkOptions: r.milk_options ?? undefined,
      powerOutlets: r.power_outlets ?? undefined,
      seating: (r.seating as "bar" | "tables" | "lounge" | "mixed") ?? undefined,
      wifiNetwork: r.wifi_network ?? undefined,
    },
    photoUrl: r.photo_url ?? null,
    sponsor: rowToSponsor(r),
  };
}

interface GetCafesOptions {
  /** Filter by ST_DWithin if all three provided. */
  lat?: number;
  lng?: number;
  radiusM?: number;
  /** Filter by city. When set, only cafés in that city are returned. */
  city?: CafeStation["city"];
  /** Return all cafés from all cities (ignores city filter). */
  all?: boolean;
}

// Shared column list, used by the single-café detail query. Includes
// `cs.photo_url`, which can be a ~50KB base64 data URL for user-contributed
// cafés. The list query (getCafes) intentionally omits this column and
// re-uses LIST_COLUMNS below — a homepage with 24 cafés would otherwise
// ship ~1.2MB of base64 just for thumbnails the card view never displays.
const CAFE_COLUMNS = `
  cs.cafe_id AS id,
  cs.name,
  cs.neighbourhood,
  cs.lat,
  cs.lng,
  cs.vibe,
  cs.tier,
  cs.city,
  cs.price_tier,
  cs.milk_options,
  cs.power_outlets,
  cs.seating,
  cs.wifi_network,
  cs.photo_url,
  cs.median_down_mbps,
  cs.median_up_mbps,
  cs.median_latency_ms,
  cs.median_jitter_ms,
  cs.median_loss_pct,
  cs.measurement_count,
  cs.sponsor_name,
  cs.sponsor_kind,
  cs.sponsor_tagline,
  lp.photo_url AS latest_photo_url
`;

// Thinned column list for the list view — drops `cs.photo_url` to keep
// homepage payloads bounded. Cards render `latestPhotoUrl` (an external
// URL from the latest measurement); when none exists, they fall back to
// the initials placeholder, not the contributor's full photo.
const LIST_COLUMNS = `
  cs.cafe_id AS id,
  cs.name,
  cs.neighbourhood,
  cs.lat,
  cs.lng,
  cs.vibe,
  cs.tier,
  cs.city,
  cs.price_tier,
  cs.milk_options,
  cs.power_outlets,
  cs.seating,
  cs.wifi_network,
  cs.median_down_mbps,
  cs.median_up_mbps,
  cs.median_latency_ms,
  cs.median_jitter_ms,
  cs.median_loss_pct,
  cs.measurement_count,
  cs.sponsor_name,
  cs.sponsor_kind,
  cs.sponsor_tagline,
  lp.photo_url AS latest_photo_url
`;

const LATEST_PHOTO_JOIN = `
  LEFT JOIN LATERAL (
    SELECT photo_url
    FROM measurements m
    WHERE m.cafe_id = cs.cafe_id AND m.photo_url IS NOT NULL
    ORDER BY m.measured_at DESC
    LIMIT 1
  ) lp ON TRUE
`;

/**
 * Returns cafés with tier + median speeds + latest photo + metadata.
 * Without coordinates → returns the whole network. With → ST_DWithin filter.
 * Result order: by distance ascending when filtered, by name otherwise.
 */
export async function getCafes(opts: GetCafesOptions = {}): Promise<CafeStation[]> {
  const { lat, lng, radiusM, city, all } = opts;
  const geoFiltered = lat !== undefined && lng !== undefined && radiusM !== undefined;

  // Build WHERE clause conditions
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (geoFiltered) {
    conditions.push(`ST_DWithin(
      c.location,
      ST_SetSRID(ST_MakePoint($${paramIdx + 1}, $${paramIdx}), 4326)::geography,
      $${paramIdx + 2}
    )`);
    params.push(lat, lng, radiusM);
    paramIdx += 3;
  }

  if (!all && city) {
    conditions.push(`cs.city = $${paramIdx}`);
    params.push(city);
    paramIdx++;
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const orderBy = geoFiltered
    ? `ORDER BY ST_Distance(
        c.location,
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
      ) ASC`
    : "ORDER BY cs.name ASC";

  const needsCafesJoin = geoFiltered; // ST_DWithin needs the cafes table
  const joinClause = needsCafesJoin
    ? "JOIN cafes c ON c.id = cs.cafe_id"
    : "";

  const sql = `
    SELECT ${LIST_COLUMNS}
    FROM cafe_speed_stats cs
    ${joinClause}
    ${LATEST_PHOTO_JOIN}
    ${whereClause}
    ${orderBy}
  `;

  try {
    const result = await query<CafeRow>(sql, params);
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

interface RecentReadingRow {
  measured_at: string | Date;
  down_mbps: string | number;
}

// Deterministic 32-bit hash of a string — used to seed the mock "recent
// readings" synthesis so the same café renders the same trail across
// server + client, while still feeling fresh each minute (the timestamps
// are anchored to the current Date.now()).
function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Tiny LCG seeded from the cafe id — same id, same sequence. We only need
// a handful of [0,1) draws per café so cryptographic quality is irrelevant.
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
  // Five readings, spaced ~roughly across the last 22 hours but biased toward
  // the recent end so the ticker always has a "minutes ago" entry up top.
  const offsetsMinutes = [
    Math.round(2 + rand() * 6),       // 2–8 minutes ago
    Math.round(18 + rand() * 35),     // 18–53 minutes
    Math.round(95 + rand() * 90),     // ~1.5–3h
    Math.round(360 + rand() * 240),   // 6–10h
    Math.round(900 + rand() * 360),   // 15–21h
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
// median, used when Aurora is unreachable. Afternoons sag (everyone's online),
// mornings are fastest — the same shape the seed data produces.
//
// When measurementCount === 0 (e.g. SF cafés, which are pre-seeded reputation
// tiers awaiting their first real reading), return an empty distribution so
// the UI can show a clean "no data yet" state rather than fabricating one.
function fallbackDetail(id: string): CafeDetail | null {
  const station = MOCK_CAFES.find((c) => c.id === id);
  if (!station) return null;
  if (station.measurementCount === 0) {
    return { ...station, distribution: [], recent: [] };
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
    recent: synthesizeRecent(id, base),
  };
}

/**
 * Single café detail with per–time-bucket distribution.
 */
export async function getCafeById(id: string): Promise<CafeDetail | null> {
  let statsResult: QueryResult<CafeRow>;
  let distResult: QueryResult<DistributionRow>;
  let recentResult: QueryResult<RecentReadingRow>;
  try {
    [statsResult, distResult, recentResult] = await Promise.all([
    query<CafeRow>(
      `
      SELECT ${CAFE_COLUMNS}
      FROM cafe_speed_stats cs
      ${LATEST_PHOTO_JOIN}
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
    query<RecentReadingRow>(
      `
      SELECT measured_at, down_mbps
      FROM measurements
      WHERE cafe_id = $1
      ORDER BY measured_at DESC
      LIMIT 5
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

  const recent = recentResult.rows.map((r) => ({
    measuredAt:
      r.measured_at instanceof Date
        ? r.measured_at.toISOString()
        : new Date(r.measured_at).toISOString(),
    downMbps: Number(r.down_mbps),
  }));

  return { ...station, distribution, recent };
}

/**
 * Resolves a slug like "about-thyme" or "sightglass-coffee-soma" to a full
 * CafeDetail by name match. Searches all cafés — DB-backed cities plus
 * mock fallback — so user-generated cafés in any city resolve correctly.
 *
 * Slugs are derived from names (see lib/slug.ts) so there's nothing to store.
 */
import { slugify } from "./slug";

export async function getCafeBySlug(slug: string): Promise<CafeDetail | null> {
  // Try DB first (all cities), then fall back to mock for SF/curated cities.
  const dbCafes = await getCafes({ all: true });
  const station = dbCafes.find((c) => slugify(c.name) === slug);
  if (station) return getCafeById(station.id);

  // Fallback to mock for cities that aren't in the DB yet.
  const mockStation = MOCK_CAFES.find((c) => slugify(c.name) === slug);
  if (mockStation) return getCafeById(mockStation.id);

  return null;
}
