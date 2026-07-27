import { NextRequest, after } from "next/server";
import { checkRateLimit, hashIp } from "@/lib/rate-limit";
import {
  deviceTypeFromUA,
  insertMeasurement,
  refreshStatsView,
  validateMeasurement,
} from "@/lib/measurements";
import type { MeasurementInput } from "@/lib/types";
import { auth, authConfigured } from "@/auth";
import { log, reqIdFrom } from "@/lib/log";
import { base44Configured, b44InsertMeasurement } from "@/lib/base44-data";
import { getBase44 } from "@/lib/base44";

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

// POST /api/measurements
// Body: { cafeId, downMbps, upMbps, latencyMs, jitterMs?, lossPct?, measuredAt?, ... }
// Inserts → rate-limit check → outlier flag → refreshes cafe_speed_stats CONCURRENTLY.
export async function POST(req: NextRequest) {
  const reqId = reqIdFrom(req);
  let body: MeasurementInput;
  try {
    body = (await req.json()) as MeasurementInput;
  } catch {
    return badRequest("body must be JSON");
  }

  if (!body.cafeId || typeof body.cafeId !== "string")
    return badRequest("cafeId required (string)");

  const validationError = validateMeasurement(body);
  if (validationError) return badRequest(validationError);

  if (body.measuredAt) {
    const d = new Date(body.measuredAt);
    if (Number.isNaN(d.getTime()))
      return badRequest("measuredAt must be a valid ISO timestamp");
  }

  const ipHash = hashIp(
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
  );

  const allowed = await checkRateLimit(ipHash, { table: "measurements", cafeId: body.cafeId });
  if (!allowed) {
    return Response.json(
      { error: "Rate limited — you've already logged a reading for this café recently. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const deviceType = deviceTypeFromUA(req.headers.get("user-agent"));
  // Legacy Auth.js session hits the dead pg adapter; skip it when Base44 is
  // the backend (userId attribution is best-effort, not a trust boundary).
  const session = authConfigured && !base44Configured ? await auth() : null;
  const userId = session?.user?.id ?? null;

  const measuredAt = body.measuredAt ? new Date(body.measuredAt) : new Date();

  // Base44 write path — bypasses the dead Postgres MV machinery. The
  // stats aggregation happens on read (get-cafe-stats function), so there
  // is no materialized view to refresh.
  if (base44Configured) {
    let measurementId: string;
    try {
      measurementId = await b44InsertMeasurement({
        cafeId: body.cafeId,
        downMbps: body.downMbps,
        upMbps: body.upMbps,
        latencyMs: body.latencyMs,
        jitterMs: body.jitterMs ?? null,
        lossPct: body.lossPct ?? null,
        measuredAt: measuredAt.toISOString(),
        photoUrl: body.photoUrl ?? null,
        testMethod: body.testMethod,
        targetServer: body.targetServer ?? null,
        deviceType,
        downloadBytes: body.downloadBytes ?? null,
        downloadDurationMs: body.downloadDurationMs ?? null,
        contributorIpHash: ipHash,
        contributorUserId: userId,
      });
    } catch (err) {
      log.error("Base44 measurement insert failed", {
        reqId,
        scope: "contribute.measurement",
        reason: err instanceof Error ? err.message : String(err),
      });
      return Response.json(
        { error: "couldn't record reading — please try again" },
        { status: 500 },
      );
    }

    // Fire-and-forget: update bounty progress after measurement insert.
    after(async () => {
      try {
        await getBase44().functions.invoke("update-bounty-progress", {
          cafe_id: body.cafeId,
          down_mbps: body.downMbps,
        });
      } catch (err) {
        log.warn("bounty progress update failed (non-fatal)", {
          reqId,
          scope: "contribute.measurement.bounty",
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    });

    return Response.json(
      { measurementId, measuredAt: measuredAt.toISOString() },
      { status: 201 },
    );
  }

  let measurementId: string;
  try {
    measurementId = await insertMeasurement(body, ipHash, deviceType, undefined, userId);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("measurements_cafe_id_fkey")) {
      return Response.json({ error: "cafe not found" }, { status: 404 });
    }
    throw err;
  }

  // Defer the materialized-view refresh until after the response. The
  // throttle in refreshStatsView() coalesces bursts; Postgres serializes
  // any genuinely concurrent attempts via the CONCURRENTLY lock.
  after(async () => {
    try {
      await refreshStatsView();
    } catch (err) {
      log.warn("MV refresh after measurement insert failed", {
        reqId,
        scope: "contribute.measurement",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return Response.json(
    { measurementId, measuredAt: measuredAt.toISOString() },
    { status: 201 },
  );
}
