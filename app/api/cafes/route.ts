import { NextRequest } from "next/server";
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

// Force dynamic — each POST runs as a function.
export const dynamic = "force-dynamic";

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

// POST /api/cafes
// Creates a new café + its first measurement in one flow. The measurement
// is mandatory — a café doesn't appear on the map until it has a real
// speed reading. This is the trust mechanism: you can't seed fake cafés.
//
// Body: CafeCreationInput (see lib/types.ts)
// Returns: { cafeId, slug, measurementId }
export async function POST(req: NextRequest) {
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

  // Insert café + first measurement in one transaction. If either fails,
  // both roll back — no orphaned café rows when a recording is being made
  // and a flaky network blips. The MV refresh runs AFTER commit because
  // REFRESH ... CONCURRENTLY cannot live inside a transaction.
  const deviceType = deviceTypeFromUA(req.headers.get("user-agent"));
  let cafeId: string;
  let measurementId: string;
  try {
    ({ cafeId, measurementId } = await withTransaction(async (tx) => {
      const cafeInsert = await tx<{ id: string }>(
        `
        INSERT INTO cafes
          (name, neighbourhood, lat, lng, location, vibe, city,
           price_tier, milk_options, power_outlets, seating, wifi_network,
           photo_url, created_by_ip_hash)
        VALUES ($1, $2, $3, $4,
          ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
          $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        ],
      );
      const newCafeId = cafeInsert.rows[0].id;
      const newMeasurementId = await insertMeasurement(
        { ...body.measurement, cafeId: newCafeId },
        ipHash,
        deviceType,
        tx,
      );
      return { cafeId: newCafeId, measurementId: newMeasurementId };
    }));
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("check_price_tier"))
      return badRequest("invalid price_tier");
    if (msg.includes("check_seating"))
      return badRequest("invalid seating type");
    console.error("[lattency] POST /api/cafes failed (rolled back):", err);
    return Response.json(
      { error: "couldn't create café — please try again" },
      { status: 500 },
    );
  }

  // Refresh the materialized view so the new café appears immediately.
  // Errors here don't roll back the café — they just delay map visibility
  // until the next refresh; surface a soft warning instead of a 500.
  try {
    await refreshStatsView();
  } catch (err) {
    console.warn("[lattency] MV refresh after café creation failed:", err);
  }

  const slug = slugify(body.name);

  return Response.json(
    { cafeId, slug, measurementId, city },
    { status: 201 },
  );
}
