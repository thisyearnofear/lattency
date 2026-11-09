import { authorizeGateway } from "./gateway-auth.ts";
import {
  measurementInputFromRecord,
  measurementRecord,
  validateMeasurement,
} from "./measurement-validation.ts";
import { publicCafe } from "./public-cafe.ts";

export interface GatewayClient {
  asServiceRole: {
    entities: {
      Measurement: {
        filter: (
          query: Record<string, unknown>,
          sort?: string,
          limit?: number,
          offset?: number,
        ) => Promise<Record<string, unknown>[]>;
        create: (record: Record<string, unknown>) => Promise<{ id: string }>;
      };
      Cafe: {
        get: (id: string) => Promise<Record<string, unknown> | null>;
      };
      VenueScan: {
        filter: (
          query: Record<string, unknown>,
          sort?: string,
          limit?: number,
          offset?: number,
        ) => Promise<Record<string, unknown>[]>;
        get: (id: string) => Promise<Record<string, unknown> | null>;
        create: (record: Record<string, unknown>) => Promise<{ id: string }>;
        update: (
          id: string,
          record: Record<string, unknown>,
        ) => Promise<unknown>;
      };
    };
  };
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

function err(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE });
}

export async function measurementGatewayHandler(
  req: Request,
  secret: string | undefined,
  makeClient: () => GatewayClient,
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
  const action = (body as Record<string, unknown>).action;
  if (typeof action !== "string") return err(400, "action required");

  try {
    const base44 = makeClient();

    if (action === "insert") {
      const measurement = (body as Record<string, unknown>).measurement;
      if (measurement === null || typeof measurement !== "object" || Array.isArray(measurement))
        return err(400, "measurement object required");
      const record = measurement as Record<string, unknown>;
      const cafeId = record.cafe_id;
      if (typeof cafeId !== "string" || cafeId.length === 0 || cafeId.length > 128)
        return err(400, "measurement.cafe_id required");

      const validationError = validateMeasurement(measurementInputFromRecord(record));
      if (validationError) return err(400, validationError);

      let cafe: Record<string, unknown> | null;
      try {
        cafe = await base44.asServiceRole.entities.Cafe.get(cafeId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) return err(404, "cafe not found");
        throw e;
      }
      if (!cafe) return err(404, "cafe not found");

      const row = await base44.asServiceRole.entities.Measurement.create(
        measurementRecord(record, cafeId),
      );
      return Response.json({ measurementId: row.id }, { status: 201, headers: NO_STORE });
    }

    if (action === "leaderboard") {
      const rows = await base44.asServiceRole.entities.Measurement.filter(
        {},
        "-measured_at",
        500,
        0,
      );
      return Response.json(
        {
          rows: rows.map((r) => ({
            contributor_user_id: r.contributor_user_id,
            cafe_id: r.cafe_id,
            measured_at: r.measured_at,
          })),
        },
        { headers: NO_STORE },
      );
    }

    if (action === "venue-scan-insert") {
      const scan = (body as Record<string, unknown>).scan;
      if (scan === null || typeof scan !== "object" || Array.isArray(scan))
        return err(400, "scan object required");
      const record = scan as Record<string, unknown>;
      const venueId = record.venue_id;
      if (typeof venueId !== "string" || venueId.length === 0 || venueId.length > 128)
        return err(400, "scan.venue_id required");
      const contributorId = record.contributor_id;
      if (
        contributorId !== undefined &&
        contributorId !== null &&
        (typeof contributorId !== "string" || contributorId.length > 128)
      )
        return err(400, "scan.contributor_id invalid");
      const assetUrl = record.capture_asset_url;
      if (
        assetUrl !== undefined &&
        assetUrl !== null &&
        (typeof assetUrl !== "string" || assetUrl.length > 2048)
      )
        return err(400, "scan.capture_asset_url invalid");

      // The consent checkpoint is re-verified server-side: a scan record
      // cannot be created without both affirmations, regardless of what the
      // caller's UI enforced.
      const consent = record.consent_attestation;
      if (consent === null || typeof consent !== "object" || Array.isArray(consent))
        return err(400, "scan.consent_attestation required");
      const attestation = consent as Record<string, unknown>;
      if (attestation.venue_permission !== true || attestation.patron_notice !== true)
        return err(400, "consent attestation must affirm venue permission and patron notice");
      const ts = attestation.timestamp;
      const timestamp =
        typeof ts === "string" && !Number.isNaN(Date.parse(ts))
          ? ts
          : new Date().toISOString();

      const row = await base44.asServiceRole.entities.VenueScan.create({
        venue_id: venueId,
        contributor_id: typeof contributorId === "string" ? contributorId : null,
        capture_asset_url: typeof assetUrl === "string" ? assetUrl : null,
        consent_attestation: {
          venue_permission: true,
          patron_notice: true,
          timestamp,
        },
        status: "captured",
        splat_url: null,
        takedown_requested: false,
        blur_verified: false,
      });
      return Response.json({ scanId: row.id }, { status: 201, headers: NO_STORE });
    }

    if (action === "venue-scans") {
      const venueId = (body as Record<string, unknown>).venue_id;
      if (typeof venueId !== "string" || venueId.length === 0 || venueId.length > 128)
        return err(400, "venue_id required");
      const rows = await base44.asServiceRole.entities.VenueScan.filter(
        { venue_id: venueId, status: "published" },
        "-created_date",
        20,
        0,
      );
      // Public projection: never expose contributor_id, consent records, or
      // the raw capture asset to readers.
      return Response.json(
        {
          scans: rows.map((r) => ({
            id: r.id,
            venue_id: r.venue_id,
            splat_url: r.splat_url ?? null,
            status: r.status,
            created: r.created_date ?? null,
          })),
        },
        { headers: NO_STORE },
      );
    }

    if (action === "venue-scan-takedown") {
      const scanId = (body as Record<string, unknown>).scan_id;
      if (typeof scanId !== "string" || scanId.length === 0 || scanId.length > 128)
        return err(400, "scan_id required");
      const venueId = (body as Record<string, unknown>).venue_id;
      if (typeof venueId !== "string" || venueId.length === 0 || venueId.length > 128)
        return err(400, "venue_id required");
      const reason = (body as Record<string, unknown>).reason;
      if (typeof reason !== "string" || reason.trim().length === 0 || reason.length > 500)
        return err(400, "reason required (max 500 characters)");

      let scan: Record<string, unknown> | null;
      try {
        scan = await base44.asServiceRole.entities.VenueScan.get(scanId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) return err(404, "scan not found");
        throw e;
      }
      // A venue_id that doesn't match the scan's venue gets the same 404 —
      // confirming the pair exists would leak scan metadata.
      if (!scan || scan.venue_id !== venueId) return err(404, "scan not found");

      await base44.asServiceRole.entities.VenueScan.update(scanId, {
        takedown_requested: true,
        takedown_reason: reason.trim(),
      });
      return Response.json({ ok: true }, { headers: NO_STORE });
    }

    if (action === "cafe") {
      const cafeId = (body as Record<string, unknown>).cafe_id;
      if (typeof cafeId !== "string" || cafeId.length === 0 || cafeId.length > 128)
        return err(400, "cafe_id required");
      let cafe: Record<string, unknown> | null;
      try {
        cafe = await base44.asServiceRole.entities.Cafe.get(cafeId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) return Response.json({ cafe: null }, { headers: NO_STORE });
        throw e;
      }
      return Response.json(
        { cafe: cafe ? publicCafe(cafe) : null },
        { headers: NO_STORE },
      );
    }

    return err(400, "unknown action");
  } catch {
    return err(503, "Contribution gateway unavailable");
  }
}
