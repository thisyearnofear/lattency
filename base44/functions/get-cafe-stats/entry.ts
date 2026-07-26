import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

interface Measurement {
  id: string;
  cafe_id: string;
  down_mbps: number;
  up_mbps: number;
  latency_ms: number;
  jitter_ms?: number | null;
  loss_pct?: number | null;
  measured_at: string;
  time_bucket?: string | null;
  is_outlier?: boolean | null;
  photo_url?: string | null;
}

function numeric(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// GET/POST { cafe_id } -> per-time-bucket distribution + 5 recent readings
// + aggregate stats, all computed server-side over the Measurement entity.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { cafe_id } = (await req.json()) as { cafe_id?: string };
    if (!cafe_id) {
      return Response.json({ error: "cafe_id required" }, { status: 400 });
    }

    const cafeMeasurements = (await base44.asServiceRole.entities.Measurement.filter(
      { cafe_id },
      "-measured_at",
      5000,
      0,
    )) as Measurement[];

    if (cafeMeasurements.length === 0) {
      return Response.json({ distribution: [], recent: [], stats: null, latest_photo_url: null });
    }

    const downs = cafeMeasurements.map((m) => numeric(m.down_mbps)).filter(Number.isFinite);
    const ups = cafeMeasurements.map((m) => numeric(m.up_mbps)).filter(Number.isFinite);
    const latencies = cafeMeasurements.map((m) => numeric(m.latency_ms)).filter(Number.isFinite);
    const jitters = cafeMeasurements.map((m) => numeric(m.jitter_ms)).filter(Number.isFinite);
    const losses = cafeMeasurements.map((m) => numeric(m.loss_pct)).filter(Number.isFinite);

    const timeBuckets = ["morning", "afternoon", "evening"] as const;
    const distribution = timeBuckets.map((tb) => {
      const bucket = cafeMeasurements.filter((m) => m.time_bucket === tb);
      const bucketDowns = bucket.map((m) => numeric(m.down_mbps)).filter(Number.isFinite);
      return {
        timeBucket: tb,
        medianDownMbps: bucketDowns.length > 0 ? median(bucketDowns) : 0,
        sampleSize: bucketDowns.length,
      };
    });

    const recent = [...cafeMeasurements]
      .sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime())
      .slice(0, 5)
      .map((m) => ({
        measuredAt: m.measured_at,
        downMbps: numeric(m.down_mbps),
      }));

    // Latest contributor photo for the detail card.
    const withPhoto = [...cafeMeasurements]
      .filter((m) => m.photo_url)
      .sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());
    const latestPhotoUrl = withPhoto[0]?.photo_url ?? null;

    const outlierExcluded = cafeMeasurements.filter((m) => !m.is_outlier);

    return Response.json({
      distribution,
      recent,
      latest_photo_url: latestPhotoUrl,
      stats: {
        medianDownMbps: median(
          outlierExcluded.length >= 3
            ? outlierExcluded.map((m) => numeric(m.down_mbps))
            : downs,
        ),
        medianUpMbps: median(ups),
        medianLatencyMs: median(latencies),
        medianJitterMs: median(jitters),
        medianLossPct: median(losses),
        measurementCount: cafeMeasurements.length,
      },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
});
