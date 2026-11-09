import { authorizeGateway } from "./gateway-auth.ts";
import {
  measurementInputFromRecord,
  measurementRecord,
  validateMeasurement,
} from "./measurement-validation.ts";
import { cafeRecord } from "./public-cafe.ts";
import type { GatewayClient } from "./measurement-gateway-handler.ts";

interface Measurement {
  id: string;
  cafe_id: string;
  down_mbps: number;
  is_outlier?: boolean | null;
}

export type CafeCreationClient = GatewayClient & {
  asServiceRole: {
    entities: {
      Cafe: {
        create: (r: Record<string, unknown>) => Promise<{ id: string }>;
        get: (id: string) => Promise<Record<string, unknown> | null>;
        delete: (id: string) => Promise<unknown>;
      };
    };
  };
};

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

function err(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE });
}

// Atomic-ish café + first measurement creation. Base44 has no transactions,
// so this is two-phase: create the café, then the measurement; if the
// measurement insert fails we delete the café to avoid an orphaned venue.
// Runs under service role so both writes bypass RLS.
export async function createCafeHandler(
  req: Request,
  secret: string | undefined,
  makeClient: () => CafeCreationClient,
): Promise<Response> {
  if (req.method !== "POST") return err(405, "Method not allowed");

  const unauthorized = await authorizeGateway(req, secret);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "body must be JSON");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body))
    return err(400, "body must be an object");
  const input = body as {
    cafe?: Record<string, unknown>;
    measurement?: Record<string, unknown>;
  };
  const cafe = input.cafe;
  const measurement = input.measurement;
  if (cafe === null || typeof cafe !== "object" || Array.isArray(cafe))
    return err(400, "cafe object required");
  if (measurement === null || typeof measurement !== "object" || Array.isArray(measurement))
    return err(400, "measurement object required");

  if (
    typeof cafe.name !== "string" ||
    cafe.name.trim().length < 2 ||
    cafe.name.trim().length > 160
  )
    return err(400, "cafe.name required (2-160 characters)");
  if (
    typeof cafe.neighbourhood !== "string" ||
    cafe.neighbourhood.trim().length < 1 ||
    cafe.neighbourhood.trim().length > 160
  )
    return err(400, "cafe.neighbourhood required");
  if (
    !Number.isFinite(cafe.latitude) ||
    (cafe.latitude as number) < -90 ||
    (cafe.latitude as number) > 90
  )
    return err(400, "latitude must be between -90 and 90");
  if (
    !Number.isFinite(cafe.longitude) ||
    (cafe.longitude as number) < -180 ||
    (cafe.longitude as number) > 180
  )
    return err(400, "longitude must be between -180 and 180");
  if (
    cafe.city !== undefined &&
    cafe.city !== null &&
    (typeof cafe.city !== "string" || cafe.city.length < 1 || cafe.city.length > 80)
  )
    return err(400, "city must be a string of at most 80 characters");
  if (
    cafe.vibe !== undefined &&
    cafe.vibe !== null &&
    (typeof cafe.vibe !== "string" || cafe.vibe.length > 280)
  )
    return err(400, "vibe must be a string of at most 280 characters");
  if (
    cafe.photo_url !== undefined &&
    cafe.photo_url !== null &&
    typeof cafe.photo_url !== "string"
  )
    return err(400, "photo_url must be a string");

  const measurementError = validateMeasurement(
    measurementInputFromRecord(measurement),
  );
  if (measurementError) return err(400, measurementError);

  let base44: CafeCreationClient;
  let cafeId: string;
  try {
    base44 = makeClient();
    const created = await base44.asServiceRole.entities.Cafe.create(
      cafeRecord(cafe),
    );
    cafeId = created.id;
  } catch {
    return err(503, "cafe create failed");
  }

  try {
    // Outlier detection against existing measurements for this café.
    const existing = (await base44.asServiceRole.entities.Measurement.filter(
      { cafe_id: cafeId },
      "-measured_at",
      5000,
      0,
    )) as unknown as Measurement[];
    const downs = existing.map((m) => Number(m.down_mbps)).filter(Number.isFinite);
    let isOutlier = false;
    if (downs.length >= 3) {
      const med = median(downs);
      if (med > 0) {
        isOutlier =
          (measurement.down_mbps as number) > med * 5 ||
          (measurement.down_mbps as number) < med * 0.2;
      }
    }

    const created = await base44.asServiceRole.entities.Measurement.create({
      ...measurementRecord(measurement, cafeId),
      is_outlier: isOutlier,
    });

    return Response.json(
      { cafeId, measurementId: created.id },
      { status: 201, headers: NO_STORE },
    );
  } catch {
    // Roll back the café so we never leave an orphaned venue.
    try {
      await base44.asServiceRole.entities.Cafe.delete(cafeId);
    } catch {
      /* best-effort cleanup */
    }
    return err(503, "measurement create failed");
  }
}
