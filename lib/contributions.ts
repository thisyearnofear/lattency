// Per-user contribution lookups for the /me dashboard. Joins user-scoped
// rows from measurements + cafes against the cafe identity (name, slug)
// so the UI can link straight back to the café the contribution belongs
// to. Read-only — writes go through the existing POST endpoints.

import { query } from "./db";
import { slugify } from "./slug";

export interface UserMeasurementRow {
  measurementId: string;
  cafeId: string;
  cafeName: string;
  cafeSlug: string;
  city: string;
  neighbourhood: string;
  downMbps: number;
  upMbps: number;
  latencyMs: number;
  jitterMs: number | null;
  lossPct: number | null;
  measuredAt: string;
  testMethod: string;
  isOutlier: boolean;
}

export interface UserCreatedCafeRow {
  cafeId: string;
  cafeName: string;
  cafeSlug: string;
  city: string;
  neighbourhood: string;
  createdAt: string;
}

interface MeasurementJoinRow {
  measurement_id: string;
  cafe_id: string;
  cafe_name: string;
  city: string | null;
  neighbourhood: string;
  down_mbps: string | number;
  up_mbps: string | number;
  latency_ms: string | number;
  jitter_ms: string | number | null;
  loss_pct: string | number | null;
  measured_at: string | Date;
  test_method: string;
  is_outlier: boolean;
}

interface CafeJoinRow {
  cafe_id: string;
  cafe_name: string;
  city: string | null;
  neighbourhood: string;
  created_at: string | Date;
}

export async function getUserMeasurements(
  userId: string,
  limit = 50,
): Promise<UserMeasurementRow[]> {
  const result = await query<MeasurementJoinRow>(
    `
    SELECT
      m.id           AS measurement_id,
      m.cafe_id,
      c.name         AS cafe_name,
      c.city,
      c.neighbourhood,
      m.down_mbps,
      m.up_mbps,
      m.latency_ms,
      m.jitter_ms,
      m.loss_pct,
      m.measured_at,
      m.test_method,
      m.is_outlier
    FROM measurements m
    JOIN cafes c ON c.id = m.cafe_id
    WHERE m.contributor_user_id = $1
    ORDER BY m.measured_at DESC
    LIMIT $2
    `,
    [userId, limit],
  );
  return result.rows.map((r) => ({
    measurementId: r.measurement_id,
    cafeId: r.cafe_id,
    cafeName: r.cafe_name,
    cafeSlug: slugify(r.cafe_name),
    city: r.city ?? "nairobi",
    neighbourhood: r.neighbourhood,
    downMbps: Number(r.down_mbps),
    upMbps: Number(r.up_mbps),
    latencyMs: Number(r.latency_ms),
    jitterMs: r.jitter_ms === null ? null : Number(r.jitter_ms),
    lossPct: r.loss_pct === null ? null : Number(r.loss_pct),
    measuredAt:
      r.measured_at instanceof Date
        ? r.measured_at.toISOString()
        : new Date(r.measured_at).toISOString(),
    testMethod: r.test_method,
    isOutlier: r.is_outlier,
  }));
}

export async function getUserCreatedCafes(
  userId: string,
  limit = 50,
): Promise<UserCreatedCafeRow[]> {
  const result = await query<CafeJoinRow>(
    `
    SELECT
      c.id         AS cafe_id,
      c.name       AS cafe_name,
      c.city,
      c.neighbourhood,
      c.created_at
    FROM cafes c
    WHERE c.created_by_user_id = $1
    ORDER BY c.created_at DESC
    LIMIT $2
    `,
    [userId, limit],
  );
  return result.rows.map((r) => ({
    cafeId: r.cafe_id,
    cafeName: r.cafe_name,
    cafeSlug: slugify(r.cafe_name),
    city: r.city ?? "nairobi",
    neighbourhood: r.neighbourhood,
    createdAt:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : new Date(r.created_at).toISOString(),
  }));
}
