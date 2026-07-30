import { NextRequest, after } from "next/server";
import { checkRateLimit, hashIp } from "@/lib/rate-limit";
import {
  deviceTypeFromUA,
  resolveTestMethod,
  validateMeasurement,
} from "@/lib/measurements";
import type { MeasurementInput } from "@/lib/types";
import { log, reqIdFrom } from "@/lib/log";
import { base44Configured, b44InsertMeasurement } from "@/lib/base44-data";
import { getBase44 } from "@/lib/base44";
import { addLocalMeasurement } from "@/lib/local-contributions";

export const dynamic = "force-dynamic";

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

// POST /api/measurements
// Body: { cafeId, downMbps, upMbps, latencyMs, jitterMs?, lossPct?, measuredAt?, ... }
// Validates → rate-limits → records. device_type and test_method provenance
// are derived server-side, never trusted from the client.
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

  // One reading per café per IP per 10 minutes. Active on every backend.
  const allowed = await checkRateLimit(ipHash, { kind: "measurement", cafeId: body.cafeId });
  if (!allowed) {
    return Response.json(
      { error: "Rate limited — you've already logged a reading for this café recently. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const deviceType = deviceTypeFromUA(req.headers.get("user-agent"));
  const measuredAt = body.measuredAt ? new Date(body.measuredAt) : new Date();

  // Base44 write path — stats aggregation happens on read (get-cafe-stats),
  // so there is no materialized view to refresh.
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

  // Mock-mode write path: append to the process-local overlay. A null return
  // means the café id is unknown (neither created here nor in the snapshot).
  const measurementId = addLocalMeasurement(
    body.cafeId,
    body,
    resolveTestMethod(body),
  );
  if (!measurementId) {
    return Response.json({ error: "cafe not found" }, { status: 404 });
  }

  return Response.json(
    { measurementId, measuredAt: measuredAt.toISOString(), mock: true },
    { status: 201 },
  );
}
