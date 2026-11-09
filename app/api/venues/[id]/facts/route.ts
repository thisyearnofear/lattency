import { NextRequest } from "next/server";
import { checkRateLimit, hashIp } from "@/lib/rate-limit";
import { sanitizeContributorId } from "@/lib/measurements";
import { ContributionGatewayUnavailable } from "@/lib/base44-gateway";
import { base44Configured, b44UpdateVenueFact } from "@/lib/base44-data";
import {
  isVenueFactField,
  venueFactValue,
} from "@/base44/shared/cafe-vocabulary";
import { log, reqIdFrom } from "@/lib/log";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400, headers: NO_STORE });
}

// POST /api/venues/[id]/facts
// Rung-2 micro-contribution: one confirmed fact about a venue, straight
// off the ask card — "Power outlets?" → yes. Body: {field, value,
// contributorId?}. The field allowlist and the value vocabulary are the
// same ones the gateway re-checks (base44/shared/cafe-vocabulary.ts);
// nothing else can be written to the venue record.
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

  const field = body.field;
  if (!isVenueFactField(field))
    return badRequest("field is not an allowed venue fact");

  const fact = venueFactValue(field, body.value);
  if (!fact.ok) return badRequest(fact.error);

  if (body.contributorId !== undefined && typeof body.contributorId !== "string")
    return badRequest("contributorId must be a string when provided");
  const contributorId = sanitizeContributorId(
    typeof body.contributorId === "string" ? body.contributorId : null,
  );

  // Fail closed: micro-contributions only exist on the live venue record —
  // there is no mock-mode fact overlay.
  if (!base44Configured) {
    return Response.json(
      { error: "venue data backend unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }

  const ipHash = hashIp(
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
  );
  const allowed = await checkRateLimit(ipHash, { kind: "fact" });
  if (!allowed) {
    return Response.json(
      { error: "Rate limited — you've confirmed a lot of details recently. Try again in an hour." },
      { status: 429, headers: NO_STORE },
    );
  }

  try {
    await b44UpdateVenueFact({
      cafeId: id,
      field,
      value: fact.value,
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
      log.error("venue fact write failed", {
        reqId,
        scope: "contribute.fact",
      });
    }
    if (!gatewayDown && (err as { status?: number })?.status === 404) {
      return Response.json(
        { error: "venue not found" },
        { status: 404, headers: NO_STORE },
      );
    }
    return Response.json(
      { error: "couldn't record the detail — please try again" },
      { status: 503, headers: NO_STORE },
    );
  }
}
