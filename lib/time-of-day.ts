// Time-of-day buckets — the same morning/afternoon/evening split used for
// speed distributions (lib/local-contributions derives it from measured_at).
// Kept here so surfaces can say "this morning" consistently with the data.

import type { TimeBucket } from "./types";

/** UTC-hour bucket, mirroring deriveTimeBucket in the create-cafe function
 *  and timeBucketFor in the mock overlay. */
export function currentBucket(d: Date = new Date()): TimeBucket {
  const hour = d.getUTCHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export const BUCKET_LABEL: Record<TimeBucket, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

interface BucketStat {
  timeBucket: TimeBucket;
  medianDownMbps: number;
  sampleSize: number;
}

/**
 * The window of day with the fastest median speed — surfaced as a "fastest
 * window" chip so the distribution chart answers a question instead of just
 * plotting one. Returns null when there's no (or all-zero) data.
 */
export function peakBucket(
  distribution: BucketStat[],
): { timeBucket: TimeBucket; medianDownMbps: number } | null {
  const withData = distribution.filter((d) => d.medianDownMbps > 0);
  if (withData.length === 0) return null;
  return withData.reduce((best, d) =>
    d.medianDownMbps > best.medianDownMbps ? d : best,
  );
}
