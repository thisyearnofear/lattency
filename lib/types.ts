export type Tier = "express" | "local" | "suspended";

// How a measurement was captured. 'manual' = contributor typed numbers from
// an external tool. 'browser-auto' = the in-app speed test ran the download /
// upload / ping sampling and submitted the result. The API derives this
// server-side from the presence of auto-test metadata, never trusting the
// client's claim alone.
export type TestMethod = "manual" | "browser-auto";

// The speed readings that both the in-app speed test and the manual form
// produce. The single source of truth shared between lib/speedtest.ts,
// components/measurement-form.tsx, and app/api/measurements/route.ts.
// jitter/loss are optional — manual entries won't have them, and early
// auto-test phases may skip upload.
export interface MeasurementReading {
  downMbps: number;
  upMbps: number;
  latencyMs: number;
  jitterMs?: number;
  lossPct?: number;
}

// What the API accepts on POST /api/measurements. Extends the reading with
// provenance metadata. device_type is NOT here — it's derived server-side
// from the User-Agent so it can't be spoofed.
export interface MeasurementInput extends MeasurementReading {
  cafeId: string;
  /** ISO 8601. Defaults to server-now if omitted. */
  measuredAt?: string;
  contributorId?: string;
  /** Optional. Real upload pipeline (S3 presigned) lands later. */
  photoUrl?: string;
  testMethod?: TestMethod;
  /** Which edge served the speed test (e.g. Vercel edge region id). */
  targetServer?: string;
  /** Bytes transferred in the download phase, for transparency. */
  downloadBytes?: number;
  /** Download phase duration in ms, for transparency. */
  downloadDurationMs?: number;
}

// String, not enum — different cities have different neighbourhoods and we
// don't want to centralise that here. The map UI only uses neighbourhood
// names for label rendering, not for layout decisions.
export type Neighbourhood = string;

export type CityId = "nairobi" | "sf";

export type TimeBucket = "morning" | "afternoon" | "evening";

// Mirrors the row shape that GET /api/cafes/near will return in STEP 2.
// Kept intentionally identical to the cafe_speed_stats view plus the
// latest photo_url join.
export interface CafeStation {
  id: string;
  name: string;
  neighbourhood: Neighbourhood;
  lat: number;
  lng: number;
  tier: Tier;
  medianDownMbps: number;
  medianUpMbps: number;
  medianLatencyMs: number;
  /** Median jitter across all auto-test readings. 0 when no auto readings. */
  medianJitterMs: number;
  /** Median packet loss % across all auto-test readings. 0 when no auto readings. */
  medianLossPct: number;
  measurementCount: number;
  latestPhotoUrl: string | null;
  /** Short editorial descriptor — the café's "atmosphere" in 2-4 words.
   *  Surfaced on station cards and in the map hover state. Stored in DB
   *  alongside the rest of the cafés metadata; STEP 2 will SELECT it. */
  vibe: string;
  /** The city this café belongs to. Currently DB-less: defaulted to
   *  'nairobi' for rows out of Aurora; SF rows live only in mock data
   *  while we prove the multi-city engine. */
  city: CityId;
}

// Returned by GET /api/cafes/[id] — detail + distribution by time bucket.
export interface CafeDetail extends CafeStation {
  distribution: Array<{
    timeBucket: TimeBucket;
    medianDownMbps: number;
    sampleSize: number;
  }>;
}
