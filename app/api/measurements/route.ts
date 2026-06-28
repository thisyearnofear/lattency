import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import type { TimeBucket } from "@/lib/types";

interface MeasurementInput {
  cafeId: string;
  downMbps: number;
  upMbps: number;
  latencyMs: number;
  /** ISO 8601. Defaults to server-now if omitted. */
  measuredAt?: string;
  contributorId?: string;
  /** Optional. Real upload pipeline (S3 presigned) lands later. */
  photoUrl?: string;
}

function deriveTimeBucket(measuredAt: Date): TimeBucket {
  // Africa/Nairobi is UTC+3, no DST. Using Intl so the rule holds if Kenya
  // ever does change (or this engine ships to a city that does).
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

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

// POST /api/measurements
// Body: { cafeId, downMbps, upMbps, latencyMs, measuredAt?, contributorId?, photoUrl? }
// Inserts → derives time_bucket → refreshes cafe_speed_stats CONCURRENTLY.
export async function POST(req: NextRequest) {
  let body: MeasurementInput;
  try {
    body = (await req.json()) as MeasurementInput;
  } catch {
    return badRequest("body must be JSON");
  }

  if (!body.cafeId || typeof body.cafeId !== "string")
    return badRequest("cafeId required (string)");
  if (!Number.isFinite(body.downMbps) || body.downMbps < 0 || body.downMbps > 10_000)
    return badRequest("downMbps must be a number between 0 and 10000");
  if (!Number.isFinite(body.upMbps) || body.upMbps < 0 || body.upMbps > 10_000)
    return badRequest("upMbps must be a number between 0 and 10000");
  if (!Number.isFinite(body.latencyMs) || body.latencyMs < 0 || body.latencyMs > 10_000)
    return badRequest("latencyMs must be a number between 0 and 10000");

  const measuredAt = body.measuredAt ? new Date(body.measuredAt) : new Date();
  if (Number.isNaN(measuredAt.getTime()))
    return badRequest("measuredAt must be a valid ISO timestamp");

  const timeBucket = deriveTimeBucket(measuredAt);

  // Insert measurement.
  let measurementId: string;
  try {
    const insert = await query<{ id: string }>(
      `
      INSERT INTO measurements
        (cafe_id, down_mbps, up_mbps, latency_ms, measured_at, time_bucket, contributor_id, photo_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
      `,
      [
        body.cafeId,
        body.downMbps,
        body.upMbps,
        body.latencyMs,
        measuredAt.toISOString(),
        timeBucket,
        body.contributorId ?? null,
        body.photoUrl ?? null,
      ],
    );
    measurementId = insert.rows[0].id;
  } catch (err) {
    const msg = (err as Error).message;
    // Foreign-key violation = no such café.
    if (msg.includes("measurements_cafe_id_fkey")) {
      return Response.json({ error: "cafe not found" }, { status: 404 });
    }
    throw err;
  }

  // Refresh the materialized view so the next read reflects this measurement.
  // CONCURRENTLY works because cafe_speed_stats has a unique index on cafe_id.
  // At 12 cafés this is sub-second; at scale, swap for a debounced background job.
  await query("REFRESH MATERIALIZED VIEW CONCURRENTLY cafe_speed_stats");

  return Response.json(
    { measurementId, timeBucket, measuredAt: measuredAt.toISOString() },
    { status: 201 },
  );
}
