import { NextRequest, after } from "next/server";
import { checkRateLimit, hashIp } from "@/lib/rate-limit";
import { validateCafeMetadata } from "@/lib/cafe-metadata";
import { deviceTypeFromUA, validateMeasurement } from "@/lib/measurements";
import { DEFAULT_CITY_ID } from "@/lib/cities";
import { slugify } from "@/lib/slug";
import type { CafeCreationInput } from "@/lib/types";
import { log, reqIdFrom } from "@/lib/log";
import { base44Configured, b44CreateCafe } from "@/lib/base44-data";
import { getBase44 } from "@/lib/base44";
import { createFounderBountyEntity } from "@/lib/bounties";
import { addLocalCafe } from "@/lib/local-contributions";

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
    const res = await getBase44().functions.invoke("list-cafes", {});
    const anyRes = res as Record<string, unknown> | null;
    const data = (anyRes?.data ?? anyRes) as Record<string, unknown> | null;
    const cafes = (data?.cafes as unknown[]) ?? [];
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
// Returns: { cafeId, slug, measurementId, city }
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

  // Rate-limit café creation: one per IP per hour. Active on every backend.
  const ipHash = hashIp(
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
  );
  const allowed = await checkRateLimit(ipHash, { kind: "cafe" });
  if (!allowed) {
    return Response.json(
      { error: "Rate limited — you've already mapped a café recently. Try again in an hour." },
      { status: 429 },
    );
  }

  // Derive city: use the provided city (lowercased so "Nairobi" / "nairobi"
  // collapse to the same bucket), or the curated default. A production
  // system would reverse-geocode from lat/lng.
  const city = body.city?.trim().toLowerCase() || DEFAULT_CITY_ID;
  const slug = slugify(body.name);
  const deviceType = deviceTypeFromUA(req.headers.get("user-agent"));

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
        },
      });
      // Fire-and-forget: materialize a real founder bounty in Base44 so the
      // reward is durable and claimable across serverless invocations, then
      // update normal bounty progress for the new café. The helper is
      // idempotent (it checks for an existing first-cafe bounty), so we can
      // safely call it on every café creation.
      after(async () => {
        try {
          await createFounderBountyEntity(city);
          await getBase44().functions.invoke("update-bounty-progress", {
            cafe_id: cafeId,
            down_mbps: body.measurement.downMbps,
          });
        } catch (err) {
          log.warn("bounty progress/founder update failed (non-fatal)", {
            reqId,
            scope: "contribute.cafe.bounty",
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      });

      return Response.json(
        { cafeId, slug, measurementId, city },
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

  // Mock-mode write path: land the café + first reading in the process-local
  // overlay so the whole contribution flow works offline (the reading is
  // still mandatory — that trust gate never relaxes).
  const { cafeId, measurementId } = addLocalCafe(
    {
      name: body.name.trim(),
      neighbourhood: body.neighbourhood.trim(),
      lat: body.lat,
      lng: body.lng,
      city,
      vibe: body.vibe?.trim() ?? "",
      venueType: body.venueType ?? "cafe",
      metadata,
      photoUrl: body.photo,
    },
    { ...body.measurement, cafeId: "" },
    body.measurement.testMethod ?? "manual",
  );

  return Response.json(
    { cafeId, slug, measurementId, city, mock: true },
    { status: 201 },
  );
}
