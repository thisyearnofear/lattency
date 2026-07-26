import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

interface Measurement {
  id: string;
  cafe_id: string;
  down_mbps: number;
  is_outlier?: boolean | null;
}

interface CreateCafeRequest {
  cafe: Record<string, unknown>;
  measurement: {
    down_mbps: number;
    up_mbps: number;
    latency_ms: number;
    jitter_ms?: number | null;
    loss_pct?: number | null;
    measured_at?: string;
    photo_url?: string | null;
    test_method?: string;
    target_server?: string | null;
    device_type?: string | null;
    download_bytes?: number | null;
    download_duration_ms?: number | null;
    contributor_ip_hash?: string | null;
    contributor_user_id?: string | null;
  };
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function deriveTimeBucket(measuredAt: Date): "morning" | "afternoon" | "evening" {
  const hour = measuredAt.getUTCHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

// Atomic-ish café + first measurement creation. Base44 has no transactions,
// so this is two-phase: create the café, then the measurement; if the
// measurement insert fails we delete the café to avoid an orphaned venue.
// Runs under service role so both writes bypass RLS.
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = (await req.json()) as CreateCafeRequest;

  if (!body.cafe?.name) {
    return Response.json({ error: "cafe.name required" }, { status: 400 });
  }
  if (!Number.isFinite(body.measurement?.down_mbps)) {
    return Response.json({ error: "measurement.down_mbps required" }, { status: 400 });
  }

  let cafeId: string;
  try {
    const cafe = (await base44.asServiceRole.entities.Cafe.create(
      body.cafe,
    )) as { id: string };
    cafeId = cafe.id;
  } catch (err) {
    return Response.json(
      { error: `cafe create failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  try {
    const measuredAt = body.measurement.measured_at
      ? new Date(body.measurement.measured_at)
      : new Date();

    // Outlier detection against existing measurements for this café.
    const existing = (await base44.asServiceRole.entities.Measurement.filter(
      { cafe_id: cafeId },
      "-measured_at",
      5000,
      0,
    )) as Measurement[];
    const downs = existing.map((m) => Number(m.down_mbps)).filter(Number.isFinite);
    let isOutlier = false;
    if (downs.length >= 3) {
      const med = median(downs);
      if (med > 0) {
        isOutlier =
          body.measurement.down_mbps > med * 5 ||
          body.measurement.down_mbps < med * 0.2;
      }
    }

    const measurement = (await base44.asServiceRole.entities.Measurement.create({
      cafe_id: cafeId,
      down_mbps: body.measurement.down_mbps,
      up_mbps: body.measurement.up_mbps,
      latency_ms: body.measurement.latency_ms,
      jitter_ms: body.measurement.jitter_ms ?? null,
      loss_pct: body.measurement.loss_pct ?? null,
      measured_at: measuredAt.toISOString(),
      time_bucket: deriveTimeBucket(measuredAt),
      photo_url: body.measurement.photo_url ?? null,
      test_method: body.measurement.test_method ?? "manual",
      target_server: body.measurement.target_server ?? null,
      device_type: body.measurement.device_type ?? null,
      download_bytes: body.measurement.download_bytes ?? null,
      download_duration_ms: body.measurement.download_duration_ms ?? null,
      contributor_ip_hash: body.measurement.contributor_ip_hash ?? null,
      contributor_user_id: body.measurement.contributor_user_id ?? null,
      is_outlier: isOutlier,
    })) as { id: string };

    return Response.json(
      { cafeId, measurementId: measurement.id },
      { status: 201 },
    );
  } catch (err) {
    // Roll back the café so we never leave an orphaned venue.
    try {
      await base44.asServiceRole.entities.Cafe.delete(cafeId);
    } catch {
      /* best-effort cleanup */
    }
    return Response.json(
      { error: `measurement create failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
});
