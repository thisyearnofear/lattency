import { NextRequest } from "next/server";
import { venueCaptureEnabled, VENUE_CAPTURE_PAUSED } from "@/lib/venue-capture-policy";
import { base44Configured, b44RequestVenueScanTakedown } from "@/lib/base44-data";
import { checkRateLimit, hashIp } from "@/lib/rate-limit";
import { log, reqIdFrom } from "@/lib/log";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

// POST /api/venue-scans/:id/takedown
// Body: { venue_id, reason }
// Verified-owner veto request — flags the scan for review. The gateway
// checks the scan exists and belongs to the claimed venue before setting
// takedown_requested; a wrong pair gets the same 404 as a missing scan.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!venueCaptureEnabled()) {
    return Response.json(
      { error: VENUE_CAPTURE_PAUSED, code: "VENUE_CAPTURE_PAUSED" },
      { status: 503, headers: NO_STORE },
    );
  }
  const reqId = reqIdFrom(req);

  const { id } = await params;
  if (typeof id !== "string" || !id || id.length > 128) {
    return Response.json({ error: "invalid scan id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "body must be an object" }, { status: 400 });
  }

  const venueId = body.venue_id;
  if (typeof venueId !== "string" || !venueId.trim() || venueId.length > 128) {
    return Response.json({ error: "venue_id required" }, { status: 400 });
  }
  const reason = body.reason;
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500) {
    return Response.json(
      { error: "reason required (max 500 characters)" },
      { status: 400 },
    );
  }

  const ipHash = hashIp(
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
  );
  const allowed = await checkRateLimit(ipHash, { kind: "takedown" });
  if (!allowed) {
    return Response.json(
      { error: "Rate limited — too many takedown requests from this address. Try again in an hour." },
      { status: 429 },
    );
  }

  if (!base44Configured) {
    return Response.json(
      { error: "venue capture backend unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }

  try {
    await b44RequestVenueScanTakedown(id, venueId, reason.trim());
    return Response.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      return Response.json({ error: "scan not found" }, { status: 404 });
    }
    log.error("venue-scan takedown failed", {
      reqId,
      scope: "venueScans.takedown",
      reason: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { error: "couldn't flag the scan — please try again" },
      { status: 503, headers: NO_STORE },
    );
  }
}
