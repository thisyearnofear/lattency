// Base44-backed data access. Replaces the Postgres/Aurora read+write path
// with Base44 entities + Deno backend functions. Every function here throws
// on failure so callers (lib/cafes.ts, lib/measurements.ts) can fall through
// to the mock snapshot. Gated on base44Configured — when the app ID is unset
// none of these are called.

import { getBase44, base44Configured } from "./base44";
import type { CafeDetail, CafeStation } from "./types";
import { log } from "./log";

export { base44Configured };

// functions.invoke() resolves to the function's JSON body, but the exact
// wrapping ({ data: ... } vs bare) varies by SDK version. This normalises.
function unwrap<T>(res: unknown, key: string): T {
  const anyRes = res as Record<string, unknown> | null;
  const data = (anyRes?.data ?? anyRes) as Record<string, unknown>;
  return data?.[key] as T;
}

/** Map load — calls the `list-cafes` backend function, which aggregates
 *  measurements into per-café stations + tiers server-side. */
export async function b44ListCafes(opts: {
  city?: string;
  lat?: number;
  lng?: number;
  radiusM?: number;
}): Promise<CafeStation[]> {
  const res = await getBase44().functions.invoke("list-cafes", {
    city: opts.city,
    lat: opts.lat,
    lng: opts.lng,
    radiusM: opts.radiusM,
  });
  return unwrap<CafeStation[]>(res, "cafes") ?? [];
}

/** Café detail — base station (from list-cafes filtered by id is wasteful,
 *  so we fetch the cafe entity + stats function directly). */
export async function b44GetCafeById(id: string): Promise<CafeDetail | null> {
  const base44 = getBase44();
  const cafe = (await base44.entities.Cafe.get(id)) as Record<string, unknown> | null;
  if (!cafe) return null;

  const statsRes = await base44.functions.invoke("get-cafe-stats", { cafe_id: id });
  const stats = unwrap<Record<string, unknown> | null>(statsRes, "stats");
  const distribution = unwrap<CafeDetail["distribution"]>(statsRes, "distribution") ?? [];
  const recent = unwrap<CafeDetail["recent"]>(statsRes, "recent") ?? [];
  const latestPhotoUrl =
    unwrap<string | null>(statsRes, "latest_photo_url") ?? (cafe.photo_url as string | null) ?? null;

  const medianDown = Number(stats?.medianDownMbps ?? 0);
  const tier = medianDown >= 50 ? "express" : medianDown >= 10 ? "local" : "suspended";

  const station: CafeStation = {
    id: String(cafe.id),
    name: String(cafe.name ?? ""),
    neighbourhood: (cafe.neighbourhood as string) ?? "",
    lat: Number(cafe.latitude),
    lng: Number(cafe.longitude),
    tier,
    medianDownMbps: medianDown,
    medianUpMbps: Number(stats?.medianUpMbps ?? 0),
    medianLatencyMs: Number(stats?.medianLatencyMs ?? 0),
    medianJitterMs: Number(stats?.medianJitterMs ?? 0),
    medianLossPct: Number(stats?.medianLossPct ?? 0),
    measurementCount: Number(stats?.measurementCount ?? 0),
    latestPhotoUrl,
    venueType: (cafe.venue_type as CafeStation["venueType"]) ?? "cafe",
    vibe: (cafe.vibe as string) ?? "",
    city: (cafe.city as string) ?? "nairobi",
    metadata: {
      priceTier: (cafe.price_tier as "budget" | "mid" | "premium") ?? undefined,
      milkOptions: (cafe.milk_options as string[]) ?? undefined,
      powerOutlets: (cafe.power_outlets as boolean) ?? undefined,
      seating: (cafe.seating as "bar" | "tables" | "lounge" | "mixed") ?? undefined,
      wifiNetwork: (cafe.wifi_network as string) ?? undefined,
      noiseLevel: (cafe.noise_level as "quiet" | "moderate" | "loud") ?? undefined,
      tableSpace: (cafe.table_space as "small" | "standard" | "large") ?? undefined,
    },
    photoUrl: (cafe.photo_url as string) ?? null,
    sponsor: null,
    lastReadingAt: recent.length > 0 ? recent[0].measuredAt : undefined,
  };

  return { ...station, distribution, recent };
}

export interface B44MeasurementInsert {
  cafeId: string;
  downMbps: number;
  upMbps: number;
  latencyMs: number;
  jitterMs?: number | null;
  lossPct?: number | null;
  measuredAt?: string;
  photoUrl?: string | null;
  testMethod?: string;
  targetServer?: string | null;
  deviceType?: string | null;
  downloadBytes?: number | null;
  downloadDurationMs?: number | null;
  contributorIpHash?: string | null;
  contributorUserId?: string | null;
  referredBy?: string | null;
}

/** Insert a single measurement under service role (bypasses RLS). */
export async function b44InsertMeasurement(m: B44MeasurementInsert): Promise<string> {
  const measured = (await getBase44().entities.Measurement.create({
    cafe_id: m.cafeId,
    down_mbps: m.downMbps,
    up_mbps: m.upMbps,
    latency_ms: m.latencyMs,
    jitter_ms: m.jitterMs ?? null,
    loss_pct: m.lossPct ?? null,
    measured_at: m.measuredAt ?? new Date().toISOString(),
    photo_url: m.photoUrl ?? null,
    test_method: m.testMethod ?? "manual",
    target_server: m.targetServer ?? null,
    device_type: m.deviceType ?? null,
    download_bytes: m.downloadBytes ?? null,
    download_duration_ms: m.downloadDurationMs ?? null,
    contributor_ip_hash: m.contributorIpHash ?? null,
    contributor_user_id: m.contributorUserId ?? null,
    referred_by: m.referredBy ?? null,
  })) as { id: string };
  return measured.id;
}

export interface B44CafeCreate {
  cafe: Record<string, unknown>;
  measurement: B44MeasurementInsert;
}

/** Atomic cafe + first measurement via the `create-cafe` backend function. */
export async function b44CreateCafe(input: B44CafeCreate): Promise<{
  cafeId: string;
  measurementId: string;
}> {
  const res = await getBase44().functions.invoke("create-cafe", {
    cafe: input.cafe,
    measurement: {
      down_mbps: input.measurement.downMbps,
      up_mbps: input.measurement.upMbps,
      latency_ms: input.measurement.latencyMs,
      jitter_ms: input.measurement.jitterMs ?? null,
      loss_pct: input.measurement.lossPct ?? null,
      measured_at: input.measurement.measuredAt,
      photo_url: input.measurement.photoUrl ?? null,
      test_method: input.measurement.testMethod ?? "manual",
      target_server: input.measurement.targetServer ?? null,
      device_type: input.measurement.deviceType ?? null,
      download_bytes: input.measurement.downloadBytes ?? null,
      download_duration_ms: input.measurement.downloadDurationMs ?? null,
      contributor_ip_hash: input.measurement.contributorIpHash ?? null,
      contributor_user_id: input.measurement.contributorUserId ?? null,
      referred_by: input.measurement.referredBy ?? null,
    },
  });
  const cafeId = unwrap<string>(res, "cafeId");
  const measurementId = unwrap<string>(res, "measurementId");
  return { cafeId, measurementId };
}

export function b44Available(): boolean {
  return base44Configured;
}

/** Mark a Base44 Bounty as paid. Returns true on success. */
export async function b44MarkBountyPaid(
  bountyId: string,
  claimedByAddress: string,
  txHash: string,
): Promise<boolean> {
  const base44 = getBase44();
  try {
    await base44.entities.Bounty.update(bountyId, {
      status: "paid",
      claimed_by_address: claimedByAddress,
      tx_hash: txHash,
    });
    return true;
  } catch (err) {
    log.warn("b44MarkBountyPaid failed", {
      scope: "bounties.paid",
      bountyId,
      reason: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// Re-export for callers that want the guard without another import.
export { log };
