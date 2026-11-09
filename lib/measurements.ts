// Measurement helpers — provenance derivation + input validation, shared
// between POST /api/measurements and POST /api/cafes. Server-side only:
// device class, test-method provenance, and outlier flags are derived
// here, never trusted from the client.

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
export { resolveTestMethod, validateMeasurement } from "../base44/shared/measurement-validation";

/**
 * Normalize a client-supplied contributor id for storage. Trim to a sane
 * length and drop empty/malformed values (→ null). The id is opaque
 * attribution, not auth, so we don't cryptographically validate its shape.
 */
export function sanitizeContributorId(value: string | undefined | null): string | null {
  if (!value || typeof value !== "string") return null;
  const clean = value.trim().slice(0, 64);
  return clean || null;
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
