// In-memory contribution overlay for mock mode (Base44 unconfigured).
// Lets local dev create cafés + log readings end-to-end without a backend:
// writes land here and are merged over the bundled snapshot on read, so
// the whole contribution flow works offline. Process-local — serverless
// instances don't share it, which is fine for a demo snapshot; the real
// backend is Base44.

import { MOCK_CAFES } from "./mock-cafes";
import { isOutlierReading } from "./measurements";
import type {
  CafeDetail,
  CafeStation,
  MeasurementInput,
  TestMethod,
  Tier,
  TimeBucket,
  VenueType,
} from "./types";
import type { CafeMetadata } from "./types";

export interface LocalCafeInput {
  name: string;
  neighbourhood: string;
  lat: number;
  lng: number;
  city: string;
  vibe: string;
  venueType: VenueType;
  metadata: CafeMetadata;
  photoUrl: string;
}

interface StoredMeasurement {
  id: string;
  downMbps: number;
  upMbps: number;
  latencyMs: number;
  jitterMs: number | null;
  lossPct: number | null;
  measuredAt: string;
  photoUrl: string | null;
  testMethod: TestMethod;
  isOutlier: boolean;
}

interface LocalCafe extends LocalCafeInput {
  id: string;
  createdAt: string;
  measurements: StoredMeasurement[];
}

// Cafés created in this process, with their full measurement history.
const createdCafes = new Map<string, LocalCafe>();
// Readings logged against cafés from the bundled snapshot (we don't own
// their history, so these ride along as extras on the detail view).
const externalReadings = new Map<string, StoredMeasurement[]>();

let counter = 0;
function localId(prefix: string): string {
  counter += 1;
  return `local-${prefix}-${Date.now().toString(36)}-${counter}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function tierFor(medianDownMbps: number): Tier {
  if (medianDownMbps >= 50) return "express";
  if (medianDownMbps >= 10) return "local";
  return "suspended";
}

function timeBucketFor(measuredAt: string): TimeBucket {
  const hour = new Date(measuredAt).getUTCHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function toStoredMeasurement(
  m: MeasurementInput,
  testMethod: TestMethod,
  isOutlier: boolean,
): StoredMeasurement {
  return {
    id: localId("reading"),
    downMbps: m.downMbps,
    upMbps: m.upMbps,
    latencyMs: m.latencyMs,
    jitterMs: m.jitterMs ?? null,
    lossPct: m.lossPct ?? null,
    measuredAt: m.measuredAt ?? new Date().toISOString(),
    photoUrl: m.photoUrl ?? null,
    testMethod,
    isOutlier,
  };
}

function toStation(cafe: LocalCafe): CafeStation {
  const clean = cafe.measurements.filter((m) => !m.isOutlier);
  const medianDown = median(clean.map((m) => m.downMbps));
  const latest = [...cafe.measurements].sort((a, b) =>
    b.measuredAt.localeCompare(a.measuredAt),
  )[0];
  const latestPhotoUrl =
    [...cafe.measurements].reverse().find((m) => m.photoUrl)?.photoUrl ??
    cafe.photoUrl ??
    null;

  return {
    id: cafe.id,
    name: cafe.name,
    neighbourhood: cafe.neighbourhood,
    lat: cafe.lat,
    lng: cafe.lng,
    tier: tierFor(medianDown),
    medianDownMbps: round1(medianDown),
    medianUpMbps: round1(median(clean.map((m) => m.upMbps))),
    medianLatencyMs: round1(median(clean.map((m) => m.latencyMs))),
    medianJitterMs: round1(
      median(clean.flatMap((m) => (m.jitterMs === null ? [] : [m.jitterMs]))),
    ),
    medianLossPct: round1(
      median(clean.flatMap((m) => (m.lossPct === null ? [] : [m.lossPct]))),
    ),
    measurementCount: cafe.measurements.length,
    latestPhotoUrl,
    venueType: cafe.venueType,
    vibe: cafe.vibe,
    city: cafe.city,
    metadata: cafe.metadata,
    photoUrl: cafe.photoUrl,
    sponsor: null,
    lastReadingAt: latest?.measuredAt,
  };
}

function toDetail(cafe: LocalCafe): CafeDetail {
  const station = toStation(cafe);
  const clean = cafe.measurements.filter((m) => !m.isOutlier);

  const buckets = new Map<TimeBucket, number[]>();
  for (const m of clean) {
    const bucket = timeBucketFor(m.measuredAt);
    const vals = buckets.get(bucket) ?? [];
    vals.push(m.downMbps);
    buckets.set(bucket, vals);
  }
  const order: TimeBucket[] = ["morning", "afternoon", "evening"];
  const distribution = order.flatMap((timeBucket) => {
    const vals = buckets.get(timeBucket);
    if (!vals || vals.length === 0) return [];
    return [{ timeBucket, medianDownMbps: round1(median(vals)), sampleSize: vals.length }];
  });

  const recent = [...cafe.measurements]
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
    .slice(0, 5)
    .map((m) => ({ measuredAt: m.measuredAt, downMbps: m.downMbps }));

  return { ...station, distribution, recent };
}

/** Create a café + its mandatory first measurement. Returns both ids. */
export function addLocalCafe(
  input: LocalCafeInput,
  m: MeasurementInput,
  testMethod: TestMethod,
): { cafeId: string; measurementId: string } {
  const cafeId = localId("cafe");
  // A café's first reading can never be an outlier — nothing to compare to.
  const measurement = toStoredMeasurement(m, testMethod, false);
  createdCafes.set(cafeId, {
    ...input,
    id: cafeId,
    createdAt: new Date().toISOString(),
    measurements: [measurement],
  });
  return { cafeId, measurementId: measurement.id };
}

/**
 * Add a measurement to an existing café — either one created in this
 * process or one from the bundled snapshot. Returns the measurement id,
 * or null when the café id is unknown (caller maps that to a 404).
 */
export function addLocalMeasurement(
  cafeId: string,
  m: MeasurementInput,
  testMethod: TestMethod,
): string | null {
  const local = createdCafes.get(cafeId);
  if (local) {
    const clean = local.measurements.filter((x) => !x.isOutlier);
    const outlier = isOutlierReading(
      median(clean.map((x) => x.downMbps)),
      clean.length,
      m.downMbps,
    );
    const measurement = toStoredMeasurement(m, testMethod, outlier);
    local.measurements.push(measurement);
    return measurement.id;
  }

  if (MOCK_CAFES.some((c) => c.id === cafeId)) {
    const measurement = toStoredMeasurement(m, testMethod, false);
    const list = externalReadings.get(cafeId) ?? [];
    list.push(measurement);
    externalReadings.set(cafeId, list);
    return measurement.id;
  }

  return null;
}

/** Stations for every café created in this process (all cities). */
export function getLocalCafes(): CafeStation[] {
  return Array.from(createdCafes.values()).map(toStation);
}

/** Detail for a café created in this process, or null. */
export function getLocalCafeDetail(id: string): CafeDetail | null {
  const cafe = createdCafes.get(id);
  return cafe ? toDetail(cafe) : null;
}

/** Readings logged against a bundled-snapshot café, newest first. */
export function getExternalReadings(
  id: string,
): Array<{ measuredAt: string; downMbps: number }> {
  return (externalReadings.get(id) ?? [])
    .map((m) => ({ measuredAt: m.measuredAt, downMbps: m.downMbps }))
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
}

/** Reset all overlay state. Exported only for tests. */
export function __resetLocalContributionsForTests(): void {
  createdCafes.clear();
  externalReadings.clear();
}
