import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { checkRateLimit, hashIp, isOutlierReading } from "@/lib/rate-limit";
import type { MeasurementInput, TestMethod, TimeBucket } from "@/lib/types";

// Derives a coarse device class from the User-Agent. Server-side only —
// the client never sends this, so it can't be spoofed. Used for trust
// weighting (auto-test readings from mobile vs desktop may differ in
// reliability due to WiFi antenna differences).
function deviceTypeFromUA(ua: string | null): string | null {
  if (!ua) return null;
  if (/Mobile|Android|iPhone/i.test(ua)) return "mobile";
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  return "desktop";
}

// If the client sent auto-test metadata (download_bytes, download_duration_ms,
// target_server), the measurement is genuinely from the in-browser speed test.
// If those are absent, treat as manual even if the client claimed otherwise —
// the client's test_method field is advisory, not authoritative.
function resolveTestMethod(body: MeasurementInput): TestMethod {
  const hasAutoMetadata =
    body.downloadBytes !== undefined && body.downloadDurationMs !== undefined;
  return hasAutoMetadata ? "browser-auto" : "manual";
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
  if (body.jitterMs !== undefined && (!Number.isFinite(body.jitterMs) || body.jitterMs < 0))
    return badRequest("jitterMs must be a non-negative number");
  if (body.lossPct !== undefined && (!Number.isFinite(body.lossPct) || body.lossPct < 0 || body.lossPct > 100))
    return badRequest("lossPct must be a number between 0 and 100");

  const measuredAt = body.measuredAt ? new Date(body.measuredAt) : new Date();
  if (Number.isNaN(measuredAt.getTime()))
    return badRequest("measuredAt must be a valid ISO timestamp");

  const timeBucket = deriveTimeBucket(measuredAt);
  const testMethod = resolveTestMethod(body);
  const deviceType = deviceTypeFromUA(req.headers.get("user-agent"));

  // Rate-limit: one measurement per IP+cafe per 10-minute window.
  // Skipped when no IP is available (local dev without proxy headers).
  const ipHash = hashIp(
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
  );
  const allowed = await checkRateLimit(ipHash, body.cafeId);
  if (!allowed) {
    return Response.json(
      { error: "Rate limited — you've already logged a reading for this café recently. Try again in a few minutes." },
      { status: 429 },
    );
  }

  // Outlier detection: flag readings wildly different from the café's
  // existing median (≥3 measurements required for a baseline). Never
  // rejects — just flags for future analysis.
  const outlier = await isOutlierReading(body.cafeId, body.downMbps);

  // Insert measurement.
  let measurementId: string;
  try {
    const insert = await query<{ id: string }>(
      `
      INSERT INTO measurements
        (cafe_id, down_mbps, up_mbps, latency_ms, jitter_ms, loss_pct,
         measured_at, time_bucket, contributor_id, photo_url,
         test_method, target_server, device_type, download_bytes, download_duration_ms,
         contributor_ip_hash, is_outlier)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
      `,
      [
        body.cafeId,
        body.downMbps,
        body.upMbps,
        body.latencyMs,
        body.jitterMs ?? null,
        body.lossPct ?? null,
        measuredAt.toISOString(),
        timeBucket,
        body.contributorId ?? null,
        body.photoUrl ?? null,
        testMethod,
        body.targetServer ?? null,
        deviceType,
        body.downloadBytes ?? null,
        body.downloadDurationMs ?? null,
        ipHash,
        outlier,
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
