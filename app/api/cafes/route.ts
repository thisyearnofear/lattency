import { NextRequest, after } from "next/server";
import { withTransaction } from "@/lib/db";
import { checkRateLimit, hashIp } from "@/lib/rate-limit";
import { validateCafeMetadata } from "@/lib/cafe-metadata";
import {
  deviceTypeFromUA,
  insertMeasurement,
  refreshStatsView,
  validateMeasurement,
} from "@/lib/measurements";
import { slugify } from "@/lib/slug";
import type { CafeCreationInput } from "@/lib/types";
import { auth, authConfigured } from "@/auth";
import { log, reqIdFrom } from "@/lib/log";
import { base44Configured, b44CreateCafe, b44ListCafes } from "@/lib/base44-data";
import { getBase44 } from "@/lib/base44";

// Force dynamic — each POST runs as a function.
export const dynamic = "force-dynamic";

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

// GET /api/cafes
// Lightweight liveness probe for the "the network is on" badge. Returns the
// real station count from Base44 so the client can celebrate a live handshake
// instead of advertising a frozen demo. When Base44 is unconfigured (mock
// snapshot) it reports `live: false` and the badge stays hidden — honesty over
// a pretty number.
export async function GET() {
  if (!base44Configured) {
    return Response.json({ count: 0, live: false });
  }
  try {
    const cafes = await b44ListCafes({});
    return Response.json({ count: cafes.length, live: true });
  } catch (err) {
    log.warn("liveness probe failed", {
      scope: "cafes.get",
      reason: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ count: 0, live: false });
  }
}

// POST /api/cafes
// Creates a new café + its first measurement in one flow. The measurement
// is mandatory — a café doesn't appear on the map until it has a real
// speed reading. This is the trust mechanism: you can't seed fake cafés.
//
// Body: CafeCreationInput (see lib/types.ts)
// Returns: { cafeId, slug, measurementId }
export async function POST(req: NextRequest) {
  const reqId = reqIdFrom(req);
  let body: CafeCreationInput;
  try {
    body = (await req.json()) as CafeCreationInput;
  } catch {
    return badRequest("body must be JSON");
  }

  // Validate café fields
  if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2)
    return badRequest("name required (min 2 characters)");
  if (!body.neighbourhood || typeof body.neighbourhood !== "string")
    return badRequest("neighbourhood required");
  if (!Number.isFinite(body.lat) || body.lat < -90 || body.lat > 90)
    return badRequest("lat must be between -90 and 90");
  if (!Number.isFinite(body.lng) || body.lng < -180 || body.lng > 180)
    return badRequest("lng must be between -180 and 180");
  if (!body.photo || typeof body.photo !== "string" || !body.photo.startsWith("data:image/"))
    return badRequest("photo required (data:image/... Base64)");

  // Validate measurement
  if (!body.measurement || !Number.isFinite(body.measurement.downMbps))
    return badRequest("measurement with downMbps required");

  const measurementError = validateMeasurement(body.measurement);
  if (measurementError) return badRequest(measurementError);

  // Validate + clean metadata
  const metadata = validateCafeMetadata(body.metadata ?? {});

  // Rate-limit café creation: one per IP per hour
  const ipHash = hashIp(
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
  );
  const allowed = await checkRateLimit(ipHash, { table: "cafes" });
  if (!allowed) {
    return Response.json(
      { error: "Rate limited — you've already mapped a café recently. Try again in an hour." },
      { status: 429 },
    );
  }

  // Derive city: use the provided city (lowercased so "Nairobi" / "nairobi"
  // collapse to the same bucket), or default to 'nairobi' for backwards
  // compat. In a production system this would reverse-geocode from lat/lng.
  const city = body.city?.trim().toLowerCase() || "nairobi";

  const deviceType = deviceTypeFromUA(req.headers.get("user-agent"));
  // Legacy Auth.js session hits the dead pg adapter; skip it on the Base44
  // backend where userId attribution is best-effort.
  const session = authConfigured && !base44Configured ? await auth() : null;
  const userId = session?.user?.id ?? null;

  // Base44 write path — the create-cafe function creates the venue + first
  // measurement atomically (two-phase with rollback) under service role.
  if (base44Configured) {
    const measuredAt = body.measurement.measuredAt
      ? new Date(body.measurement.measuredAt)
      : new Date();
    try {
      const { cafeId, measurementId } = await b44CreateCafe({
        cafe: {
          name: body.name.trim(),
          neighbourhood: body.neighbourhood.trim(),
          latitude: body.lat,
          longitude: body.lng,
          vibe: body.vibe?.trim() || null,
          venue_type: body.venueType ?? "cafe",
          city,
          price_tier: metadata.priceTier ?? null,
          milk_options: metadata.milkOptions ?? null,
          power_outlets: metadata.powerOutlets ?? null,
          seating: metadata.seating ?? null,
          noise_level: metadata.noiseLevel ?? null,
          table_space: metadata.tableSpace ?? null,
          wifi_network: metadata.wifiNetwork ?? null,
          photo_url: body.photo,
          created_by_ip_hash: ipHash,
          created_by_user_id: userId,
        },
        measurement: {
          cafeId: "", // set server-side from the created cafe id
          downMbps: body.measurement.downMbps,
          upMbps: body.measurement.upMbps,
          latencyMs: body.measurement.latencyMs,
          jitterMs: body.measurement.jitterMs ?? null,
          lossPct: body.measurement.lossPct ?? null,
          measuredAt: measuredAt.toISOString(),
          photoUrl: body.measurement.photoUrl ?? null,
          testMethod: body.measurement.testMethod,
          targetServer: body.measurement.targetServer ?? null,
          deviceType,
          downloadBytes: body.measurement.downloadBytes ?? null,
          downloadDurationMs: body.measurement.downloadDurationMs ?? null,
          contributorIpHash: ipHash,
          contributorUserId: userId,
        },
      });
      // Fire-and-forget: update bounty progress for the new café's measurement.
      after(async () => {
        try {
          await getBase44().functions.invoke("update-bounty-progress", {
            cafe_id: cafeId,
            down_mbps: body.measurement.downMbps,
          });
        } catch (err) {
          log.warn("bounty progress update failed (non-fatal)", {
            reqId,
            scope: "contribute.cafe.bounty",
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      });

      return Response.json(
        { cafeId, slug: slugify(body.name), measurementId, city },
        { status: 201 },
      );
    } catch (err) {
      log.error("Base44 café creation failed", {
        reqId,
        scope: "contribute.cafe",
        reason: err instanceof Error ? err.message : String(err),
      });
      return Response.json(
        { error: "couldn't create café — please try again" },
        { status: 500 },
      );
    }
  }

  // Insert café + first measurement in one transaction. If either fails,
  // both roll back — no orphaned café rows when a recording is being made
  // and a flaky network blips. The MV refresh runs AFTER commit because
  // REFRESH ... CONCURRENTLY cannot live inside a transaction.
  let cafeId: string;
  let measurementId: string;
  try {
    ({ cafeId, measurementId } = await withTransaction(async (tx) => {
      const cafeInsert = await tx<{ id: string }>(
        `
        INSERT INTO cafes
          (name, neighbourhood, lat, lng, location, vibe, city,
           price_tier, milk_options, power_outlets, seating, wifi_network,
           photo_url, created_by_ip_hash, created_by_user_id)
        VALUES ($1, $2, $3, $4,
          ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
          $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
        `,
        [
          body.name.trim(),
          body.neighbourhood.trim(),
          body.lat,
          body.lng,
          body.vibe?.trim() || null,
          city,
          metadata.priceTier ?? null,
          metadata.milkOptions ?? null,
          metadata.powerOutlets ?? null,
          metadata.seating ?? null,
          metadata.wifiNetwork ?? null,
          body.photo,
          ipHash,
          userId,
        ],
      );
      const newCafeId = cafeInsert.rows[0].id;
      const newMeasurementId = await insertMeasurement(
        { ...body.measurement, cafeId: newCafeId },
        ipHash,
        deviceType,
        tx,
        userId,
      );
      return { cafeId: newCafeId, measurementId: newMeasurementId };
    }));
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("check_price_tier"))
      return badRequest("invalid price_tier");
    if (msg.includes("check_seating"))
      return badRequest("invalid seating type");
    log.error("POST /api/cafes failed (rolled back)", {
      reqId,
      scope: "contribute.cafe",
      reason: msg,
    });
    return Response.json(
      { error: "couldn't create café — please try again" },
      { status: 500 },
    );
  }

  // Defer the materialized-view refresh until after the response is sent.
  // `after()` keeps the function instance alive past the response so the
  // client doesn't pay for refresh latency; the throttle in
  // refreshStatsView() coalesces bursts so concurrent writes share one
  // refresh. Errors are swallowed because the café is already committed
  // and will appear on the next refresh anyway.
  after(async () => {
    try {
      await refreshStatsView();
    } catch (err) {
      log.warn("MV refresh after café creation failed", {
        reqId,
        scope: "contribute.cafe",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const slug = slugify(body.name);

  return Response.json(
    { cafeId, slug, measurementId, city },
    { status: 201 },
  );
}
