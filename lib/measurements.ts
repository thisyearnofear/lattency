// Measurement helpers — provenance derivation + input validation, shared
// between POST /api/measurements and POST /api/cafes. Server-side only:
// device class, test-method provenance, and outlier flags are derived
// here, never trusted from the client.

import type { MeasurementInput, TestMethod } from "./types";

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
 * Detects whether a reading is a statistical outlier relative to the
 * café's existing measurements. Flags readings that are >5x or <0.2x the
 * current median, but only when there are already ≥3 measurements on file.
 *
 * Pure — the caller supplies the café's current median + count. Never
 * rejects — the flag just excludes the reading from aggregate stats.
 */
export function isOutlierReading(
  medianDownMbps: number,
  measurementCount: number,
  downMbps: number,
): boolean {
  if (measurementCount < 3) return false;
  if (!Number.isFinite(medianDownMbps) || medianDownMbps <= 0) return false;
  return downMbps > medianDownMbps * 5 || downMbps < medianDownMbps * 0.2;
}
