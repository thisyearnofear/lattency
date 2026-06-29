// Rate-limiting for measurement submissions.
//
// Prevents a single IP from spamming measurements for the same café.
// DB-backed (no Redis dependency) — a simple existence check against the
// measurements table. At hackathon scale this is sub-millisecond; at real
// traffic, swap for a Redis-backed sliding window.
//
// Privacy: we store a SHA-256 hash of the client IP, never the raw IP.
// The hash is one-way and is never returned by any API endpoint. It exists
// solely for the rate-limit comparison.

import { createHash } from "node:crypto";
import { query } from "./db";

// Window: one measurement per IP+cafe per 10 minutes. Long enough to
// prevent spam, short enough that a contributor can log a second reading
// if the first was anomalous.
const RATE_LIMIT_WINDOW_MINUTES = 10;

/**
 * Hash a client IP address with SHA-256. Returns null if the IP is absent
 * (e.g. a local dev request with no proxy headers) — in that case the
 * rate-limit check is skipped (no IP to track).
 */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  // x-forwarded-for can contain multiple IPs; take the first (the client).
  const clean = ip.split(",")[0].trim();
  if (!clean) return null;
  return createHash("sha256").update(clean).digest("hex");
}

/**
 * Checks whether a measurement from this IP hash + café is allowed under
 * the rate limit. Returns true if allowed, false if rate-limited.
 *
 * When ipHash is null (no IP available), always returns true — we can't
 * rate-limit without an identifier, and blocking would break local dev.
 */
export async function checkRateLimit(
  ipHash: string | null,
  cafeId: string,
): Promise<boolean> {
  if (!ipHash) return true;

  const result = await query<{ exists: number }>(
    `
    SELECT 1 AS exists
    FROM measurements
    WHERE contributor_ip_hash = $1
      AND cafe_id = $2
      AND measured_at > NOW() - ($3 || ' minutes')::interval
    LIMIT 1
    `,
    [ipHash, cafeId, RATE_LIMIT_WINDOW_MINUTES],
  );

  return result.rows.length === 0;
}

/**
 * Detects whether a reading is a statistical outlier relative to the
 * café's existing measurements. Flags readings that are >5x or <0.2x the
 * current median, but only when there are already ≥3 measurements on file
 * (fewer than 3 isn't enough to establish a baseline).
 *
 * Returns false (not an outlier) when there's insufficient data or when
 * the reading is within the expected range. Never rejects — just flags.
 */
export async function isOutlierReading(
  cafeId: string,
  downMbps: number,
): Promise<boolean> {
  const result = await query<{
    median_down: string | number | null;
    measurement_count: string | number;
  }>(
    `
    SELECT median_down_mbps AS median_down, measurement_count
    FROM cafe_speed_stats
    WHERE cafe_id = $1
    `,
    [cafeId],
  );

  const row = result.rows[0];
  if (!row) return false; // No existing measurements — can't be an outlier.

  const count = Number(row.measurement_count);
  if (count < 3) return false; // Not enough baseline data.

  const median = Number(row.median_down);
  if (!Number.isFinite(median) || median <= 0) return false;

  return downMbps > median * 5 || downMbps < median * 0.2;
}
