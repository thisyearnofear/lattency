export type Tier = "express" | "local" | "suspended";

export type Neighbourhood = "Westlands" | "Kilimani" | "CBD" | "Karen";

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
  measurementCount: number;
  latestPhotoUrl: string | null;
  /** Short editorial descriptor — the café's "atmosphere" in 2-4 words.
   *  Surfaced on station cards and in the map hover state. Stored in DB
   *  alongside the rest of the cafés metadata; STEP 2 will SELECT it. */
  vibe: string;
}

// Returned by GET /api/cafes/[id] — detail + distribution by time bucket.
export interface CafeDetail extends CafeStation {
  distribution: Array<{
    timeBucket: TimeBucket;
    medianDownMbps: number;
    sampleSize: number;
  }>;
}
