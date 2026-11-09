import { NextRequest } from "next/server";
import {
  venueCaptureAllowedForCity,
  venueCaptureCrewAllowed,
  venueCaptureEnabled,
  VENUE_CAPTURE_CREW_DENIED,
  VENUE_CAPTURE_JURISDICTION_DENIED,
  VENUE_CAPTURE_PAUSED,
} from "@/lib/venue-capture-policy";
import {
  base44Configured,
  b44GetCafeById,
  b44InsertVenueScan,
  b44ListPublishedVenueScans,
} from "@/lib/base44-data";
import { sanitizeContributorId } from "@/lib/measurements";
import { log, reqIdFrom } from "@/lib/log";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function capturePaused(): Response {
  return Response.json(
    { error: VENUE_CAPTURE_PAUSED, code: "VENUE_CAPTURE_PAUSED" },
    { status: 503, headers: NO_STORE },
  );
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

// GET /api/venue-scans?venue_id=<id>
// Returns only published scans for the venue, projected to public fields
// upstream by the gateway — contributor identity and consent records never
// leave the backend.
export async function GET(req: NextRequest) {
  if (!venueCaptureEnabled()) return capturePaused();

  const venueId = new URL(req.url).searchParams.get("venue_id");
  if (!venueId || venueId.length > 128) {
    return badRequest("venue_id required");
  }
  if (!base44Configured) {
    return Response.json(
      { error: "venue capture backend unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
  try {
    const scans = await b44ListPublishedVenueScans(venueId);
    return Response.json({ scans }, { headers: NO_STORE });
  } catch (err) {
    log.error("venue-scan list failed", {
      reqId: reqIdFrom(req),
      scope: "venueScans.list",
      reason: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { error: "couldn't load venue scans — please try again" },
      { status: 503, headers: NO_STORE },
    );
  }
}

// POST /api/venue-scans
// Body: { venue_id, contributor_id, capture_asset_url?, consent_attestation }
// Creates a VenueScan row in `captured` status. The consent attestation is
// the trust mechanism: both venue_permission and patron_notice must be
// affirmed, and the gateway re-verifies them before writing.
export async function POST(req: NextRequest) {
  if (!venueCaptureEnabled()) return capturePaused();
  const reqId = reqIdFrom(req);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("body must be JSON");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body))
    return badRequest("body must be an object");

  const venueId = body.venue_id;
  if (
    typeof venueId !== "string" ||
    !venueId ||
    venueId !== venueId.trim() ||
    venueId.length > 128
  )
    return badRequest("venue_id required (non-empty string, max 128 characters)");

  const contributorId = sanitizeContributorId(
    typeof body.contributor_id === "string" ? body.contributor_id : null,
  );
  if (!contributorId) return badRequest("contributor_id required");

  const assetUrl = body.capture_asset_url;
  if (
    assetUrl !== undefined &&
    assetUrl !== null &&
    (typeof assetUrl !== "string" || assetUrl.length > 2048)
  )
    return badRequest("capture_asset_url must be a string (max 2048 characters)");

  const consent = body.consent_attestation;
  if (consent === null || typeof consent !== "object" || Array.isArray(consent))
    return badRequest("consent_attestation required");
  const attestation = consent as Record<string, unknown>;
  if (attestation.venue_permission !== true || attestation.patron_notice !== true)
    return badRequest(
      "venue scans require both consent affirmations — venue permission and patron notice. A scan can't be recorded without them.",
    );
  const attestedAt = attestation.timestamp;
  const timestamp =
    typeof attestedAt === "string" && !Number.isNaN(Date.parse(attestedAt))
      ? attestedAt
      : new Date().toISOString();

  // Pilot-crew gate — when VENUE_CAPTURE_CREW is set, only listed
  // contributor ids may create scans. Unset = open while the flag is on.
  if (!venueCaptureCrewAllowed(contributorId)) {
    return Response.json(
      { error: VENUE_CAPTURE_CREW_DENIED },
      { status: 403 },
    );
  }

  if (!base44Configured) {
    return Response.json(
      { error: "venue capture backend unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }

  // Launch-jurisdiction gate — the venue's city is resolved from the record
  // server-side; a `city` hint in the body may corroborate, never override.
  const cityHint =
    typeof body.city === "string" && body.city.trim() ? body.city : null;
  let city: string | undefined;
  try {
    const venue = await b44GetCafeById(venueId);
    if (!venue) {
      return Response.json({ error: "venue not found" }, { status: 404 });
    }
    city = venue.city;
  } catch (err) {
    log.error("venue-scan city lookup failed", {
      reqId,
      scope: "venueScans.jurisdiction",
      reason: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { error: "couldn't verify the venue — please try again" },
      { status: 503, headers: NO_STORE },
    );
  }
  if (cityHint && cityHint.trim().toLowerCase() !== city.trim().toLowerCase()) {
    return badRequest("city hint doesn't match the venue record");
  }
  if (!venueCaptureAllowedForCity(city)) {
    return Response.json(
      { error: VENUE_CAPTURE_JURISDICTION_DENIED },
      { status: 403 },
    );
  }

  try {
    const scanId = await b44InsertVenueScan({
      venueId,
      contributorId,
      captureAssetUrl: typeof assetUrl === "string" ? assetUrl : null,
      consentAttestation: {
        venue_permission: true,
        patron_notice: true,
        timestamp,
      },
    });
    return Response.json({ scanId, status: "captured" }, { status: 201 });
  } catch (err) {
    log.error("venue-scan insert failed", {
      reqId,
      scope: "venueScans.create",
      reason: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { error: "couldn't record the scan — please try again" },
      { status: 503, headers: NO_STORE },
    );
  }
}
