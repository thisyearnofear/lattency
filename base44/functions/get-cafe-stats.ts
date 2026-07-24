import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

interface Measurement {
  _id: string;
  cafe_id: string;
  down_mbps: number;
  up_mbps: number;
  latency_ms: number;
  jitter_ms?: number | null;
  loss_pct?: number | null;
  measured_at: string;
  time_bucket?: string | null;
  is_outlier?: boolean | null;
}

function numeric(v: unknown): number {
  if (typeof v === "number") return v;
  return Number(v);
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const { cafe_id } = (await req.json()) as { cafe_id?: string };
  if (!cafe_id) {
    return Response.json({ error: "cafe_id required" }, { status: 400 });
  }

  const measurements = (await base44.entities.Measurement.list(
    "-created_date",
    5000,
    0,
  )) as Measurement[];
  const cafeMeasurements = measurements.filter((m) => m.cafe_id === cafe_id);

  if (cafeMeasurements.length === 0) {
    return Response.json({ distribution: [], recent: [], stats: null });
  }

  const downs = cafeMeasurements
    .map((m) => numeric(m.down_mbps))
    .filter(Number.isFinite);
  const ups = cafeMeasurements
    .map((m) => numeric(m.up_mbps))
    .filter(Number.isFinite);
  const latencies = cafeMeasurements
    .map((m) => numeric(m.latency_ms))
    .filter(Number.isFinite);
  const jitters = cafeMeasurements
    .map((m) => numeric(m.jitter_ms))
    .filter(Number.isFinite);
  const losses = cafeMeasurements
    .map((m) => numeric(m.loss_pct))
    .filter(Number.isFinite);

  const timeBuckets = ["morning", "afternoon", "evening"] as const;
  const distribution = timeBuckets.map((tb) => {
    const bucket = cafeMeasurements.filter((m) => m.time_bucket === tb);
    const bucketDowns = bucket
      .map((m) => numeric(m.down_mbps))
      .filter(Number.isFinite);
    return {
      timeBucket: tb,
      medianDownMbps: bucketDowns.length > 0 ? median(bucketDowns) : 0,
      sampleSize: bucketDowns.length,
    };
  });

  const recent = cafeMeasurements
    .sort(
      (a, b) =>
        new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime(),
    )
    .slice(0, 5)
    .map((m) => ({
      measuredAt: m.measured_at,
      downMbps: numeric(m.down_mbps),
    }));

  const outlierExcluded = cafeMeasurements.filter((m) => !m.is_outlier);

  return Response.json({
    distribution,
    recent,
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
});
