import { NextRequest } from "next/server";
import {
  venueCaptureEnabled,
  VENUE_CAPTURE_PAUSED,
} from "@/lib/venue-capture-policy";
import { resolveVenueCaptureAccess } from "@/lib/venue-capture-gate";
import {
  base44Configured,
  b44InsertVenueScan,
  b44ListVenueScans,
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
// Returns the venue's publicly-visible scans (captured → processing →
// preview → refining → published), projected to safe fields upstream by
// the gateway. Pipeline status is transparent; splat_url only projects
// once published. Contributor identity and consent records never leave
// the backend.
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
    const scans = await b44ListVenueScans(venueId);
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
// Body: { venue_id, contributor_id, capture_asset_url?, supersedes_id?,
//         consent_attestation }
// Creates a VenueScan row in `captured` status. The consent attestation is
// the trust mechanism: both venue_permission and patron_notice must be
// affirmed, and the gateway re-verifies them before writing. An optional
// supersedes_id marks this run as a rescan/gap-fill of a prior scan for
// the same venue — the gateway retires that row to `superseded`.
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

  const supersedesId = body.supersedes_id;
  if (
    supersedesId !== undefined &&
    supersedesId !== null &&
    (typeof supersedesId !== "string" ||
      !supersedesId.trim() ||
      supersedesId.length > 128)
  )
    return badRequest("supersedes_id must be a string (max 128 characters)");

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

  // Shared capture gate: pilot-crew membership, configured backend, and
  // launch jurisdiction resolved from the venue record (a `city` body hint
  // may corroborate, never override).
  const cityHint =
    typeof body.city === "string" && body.city.trim() ? body.city : null;
  const access = await resolveVenueCaptureAccess({
    contributorId,
    venueId,
    cityHint,
    reqId,
    scope: "venueScans.jurisdiction",
  });
  if (!access.ok) return access.res;

  try {
    const { scanId, superseded } = await b44InsertVenueScan({
      venueId,
      contributorId,
      captureAssetUrl: typeof assetUrl === "string" ? assetUrl : null,
      supersedesId: typeof supersedesId === "string" ? supersedesId : null,
      consentAttestation: {
        venue_permission: true,
        patron_notice: true,
        timestamp,
      },
    });
    return Response.json(
      {
        scanId,
        status: "captured",
        ...(typeof supersedesId === "string" ? { superseded } : {}),
      },
      { status: 201 },
    );
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
