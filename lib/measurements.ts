// Measurement insert logic — shared between POST /api/measurements and
// POST /api/cafes (which creates a café + its first measurement in one
// transaction). Single source of truth for provenance derivation, time
// bucketing, and the INSERT statement.
//
// Extracted from app/api/measurements/route.ts to avoid duplicating the
// insert + provenance logic across two endpoints.

import { query } from "./db";
import { isOutlierReading } from "./rate-limit";
import type { MeasurementInput, TestMethod, TimeBucket } from "./types";

// Derives a coarse device class from the User-Agent. Server-side only —
// the client never sends this, so it can't be spoofed.
export function deviceTypeFromUA(ua: string | null): string | null {
  if (!ua) return null;
  if (/Mobile|Android|iPhone/i.test(ua)) return "mobile";
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  return "desktop";
}

// If the client sent auto-test metadata (download_bytes, download_duration_ms,
// target_server), the measurement is genuinely from the in-browser speed test.
// If those are absent, treat as manual even if the client claimed otherwise.
export function resolveTestMethod(body: MeasurementInput): TestMethod {
  const hasAutoMetadata =
    body.downloadBytes !== undefined && body.downloadDurationMs !== undefined;
  return hasAutoMetadata ? "browser-auto" : "manual";
}

export function deriveTimeBucket(measuredAt: Date): TimeBucket {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Nairobi",
      hour: "numeric",
      hour12: false,
    }).format(measuredAt),
  );
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function validateMeasurement(body: MeasurementInput): string | null {
  if (!Number.isFinite(body.downMbps) || body.downMbps < 0 || body.downMbps > 10_000)
    return "downMbps must be a number between 0 and 10000";
  if (!Number.isFinite(body.upMbps) || body.upMbps < 0 || body.upMbps > 10_000)
    return "upMbps must be a number between 0 and 10000";
  if (!Number.isFinite(body.latencyMs) || body.latencyMs < 0 || body.latencyMs > 10_000)
    return "latencyMs must be a number between 0 and 10000";
  if (body.jitterMs !== undefined && (!Number.isFinite(body.jitterMs) || body.jitterMs < 0))
    return "jitterMs must be a non-negative number";
  if (body.lossPct !== undefined && (!Number.isFinite(body.lossPct) || body.lossPct < 0 || body.lossPct > 100))
    return "lossPct must be a number between 0 and 100";
  return null;
}

/**
 * Insert a measurement. Used by both POST /api/measurements and
 * POST /api/cafes. Returns the measurement ID.
 *
 * Does NOT do rate-limiting — the caller is responsible for that.
 * Does NOT refresh the materialized view — the caller does that
 * (once, after any additional inserts in the same transaction).
 */
export async function insertMeasurement(
  body: MeasurementInput,
  ipHash: string | null,
  deviceType: string | null,
): Promise<string> {
  const measuredAt = body.measuredAt ? new Date(body.measuredAt) : new Date();
  const timeBucket = deriveTimeBucket(measuredAt);
  const testMethod = resolveTestMethod(body);
  const outlier = await isOutlierReading(body.cafeId, body.downMbps);

  const insert = await query<{ id: string }>(
    `
    INSERT INTO measurements
      (cafe_id, down_mbps, up_mbps, latency_ms, jitter_ms, loss_pct,
       measured_at, time_bucket, contributor_id, photo_url,
       test_method, target_server, device_type, download_bytes, download_duration_ms,
       contributor_ip_hash, is_outlier)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING id
    `,
    [
      body.cafeId,
      body.downMbps,
      body.upMbps,
      body.latencyMs,
      body.jitterMs ?? null,
      body.lossPct ?? null,
      measuredAt.toISOString(),
      timeBucket,
      body.contributorId ?? null,
      body.photoUrl ?? null,
      testMethod,
      body.targetServer ?? null,
      deviceType,
      body.downloadBytes ?? null,
      body.downloadDurationMs ?? null,
      ipHash,
      outlier,
    ],
  );

  return insert.rows[0].id;
}

/**
 * Refresh the materialized view. Called after any measurement insert.
 * CONCURRENTLY works because cafe_speed_stats has a unique index.
 */
export async function refreshStatsView(): Promise<void> {
  await query("REFRESH MATERIALIZED VIEW CONCURRENTLY cafe_speed_stats");
}
