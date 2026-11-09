import { NextRequest } from "next/server";
import { checkRateLimit, hashIp } from "@/lib/rate-limit";
import { sanitizeContributorId } from "@/lib/measurements";
import { ContributionGatewayUnavailable } from "@/lib/base44-gateway";
import { base44Configured, b44UpdateVenuePhoto } from "@/lib/base44-data";
import { venuePhotoError } from "@/base44/shared/cafe-vocabulary";
import { log, reqIdFrom } from "@/lib/log";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400, headers: NO_STORE });
}

// POST /api/venues/[id]/photos
// Rung-3 micro-contribution: one photo becomes the venue's face
// (newest-wins on Cafe.photo_url). Body: {photo (JPEG/PNG data URL),
// consentPeople: true, contributorId?}. The people-free affirmation is
// required — the photo surfaces publicly, and we can't blur what we
// don't store (Phase 1 infra has no moderation pipeline).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const reqId = reqIdFrom(req);
  const { id } = await params;
  if (
    typeof id !== "string" ||
    !id ||
    id !== id.trim() ||
    id.length > 128
  )
    return badRequest("invalid venue id");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("body must be JSON");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body))
    return badRequest("body must be an object");

  const photoError = venuePhotoError(body.photo);
  if (photoError) return badRequest(photoError);

  if (body.consentPeople !== true)
    return badRequest(
      "Confirm no identifiable people are in the shot before sending",
    );

  if (body.contributorId !== undefined && typeof body.contributorId !== "string")
    return badRequest("contributorId must be a string when provided");
  const contributorId = sanitizeContributorId(
    typeof body.contributorId === "string" ? body.contributorId : null,
  );

  // Fail closed: photos write to the live venue record — there is no
  // mock-mode photo overlay.
  if (!base44Configured) {
    return Response.json(
      { error: "venue data backend unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }

  const ipHash = hashIp(
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
  );
  const allowed = await checkRateLimit(ipHash, { kind: "photo" });
  if (!allowed) {
    return Response.json(
      { error: "Rate limited — you've sent a few photos recently. Try again in an hour." },
      { status: 429, headers: NO_STORE },
    );
  }

  try {
    await b44UpdateVenuePhoto({
      cafeId: id,
      photoUrl: body.photo as string,
      contributorId,
      contributorIpHash: ipHash,
    });
    return Response.json(
      { ok: true, verification: "community-reported" },
      { status: 201, headers: NO_STORE },
    );
  } catch (err) {
    const gatewayDown = err instanceof ContributionGatewayUnavailable;
    if (!gatewayDown) {
      log.error("venue photo write failed", {
        reqId,
        scope: "contribute.photo",
      });
    }
    if (!gatewayDown && (err as { status?: number })?.status === 404) {
      return Response.json(
        { error: "venue not found" },
        { status: 404, headers: NO_STORE },
      );
    }
    return Response.json(
      { error: "couldn't send the photo — please try again" },
      { status: 503, headers: NO_STORE },
    );
  }
}
