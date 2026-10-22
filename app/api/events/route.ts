import { NextRequest } from "next/server";
import { checkRateLimit, hashIp } from "@/lib/rate-limit";
import { base44Configured } from "@/lib/base44";
import { sanitizeContributorId } from "@/lib/measurements";
import {
  approveLocalEvent,
  getEvents,
  getPendingEvents,
  submitEvent,
  validateEventInput,
  type EventInput,
} from "@/lib/events";
import { log, reqIdFrom } from "@/lib/log";

// Force dynamic — the board changes minute to minute.
export const dynamic = "force-dynamic";

// GET /api/events?city=london&contributor=contrib-…
// Public: the upcoming approved events for a city. `pending` is scoped to the
// calling contributor's own submissions, and only exists in the offline
// overlay — the Base44 read rule never returns an unapproved row.
export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get("city")?.toLowerCase() || undefined;
  const contributor = sanitizeContributorId(
    req.nextUrl.searchParams.get("contributor"),
  );
  const [events, pending] = await Promise.all([
    getEvents({ city }),
    Promise.resolve(base44Configured ? [] : getPendingEvents(contributor)),
  ]);
  return Response.json({ events, pending, live: base44Configured });
}

// POST /api/events
// An organiser submits an event for a venue. It lands unapproved — the
// submitter never decides what appears on the shared board.
//
// Body: { title, startsAt, venueId, communityName?, link?, city, contributorId }
// Returns: { id, approved: false, pending: true }
export async function POST(req: NextRequest) {
  const reqId = reqIdFrom(req);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }

  // Demo-mode approval: the offline stand-in for the Base44 moderator action,
  // so the approve step is visible in a demo. Never reachable against a real
  // backend, where approval is a privileged write.
  if (body.action === "approve") {
    if (base44Configured) {
      return Response.json(
        { error: "approval runs through the Base44 admin, not this route" },
        { status: 403 },
      );
    }
    const id = typeof body.id === "string" ? body.id : "";
    if (!approveLocalEvent(id)) {
      return Response.json({ error: "submission not found" }, { status: 404 });
    }
    return Response.json({ id, approved: true });
  }

  const error = validateEventInput(body);
  if (error) return Response.json({ error }, { status: 400 });

  const ipHash = hashIp(
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
  );
  const allowed = await checkRateLimit(ipHash, { kind: "event" });
  if (!allowed) {
    return Response.json(
      { error: "Rate limited — five submissions per hour. Try again later." },
      { status: 429 },
    );
  }

  const input: EventInput = {
    title: String(body.title),
    startsAt: String(body.startsAt),
    venueId: String(body.venueId),
    communityName: typeof body.communityName === "string" ? body.communityName : null,
    city: String(body.city),
    link: typeof body.link === "string" ? body.link : null,
    submittedBy: sanitizeContributorId(
      typeof body.contributorId === "string" ? body.contributorId : null,
    ),
  };

  try {
    const event = await submitEvent(input);
    return Response.json({ ...event, pending: true }, { status: 201 });
  } catch (err) {
    log.error("event submission failed", {
      reqId,
      scope: "contribute.event",
      reason: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { error: "couldn't submit event — please try again" },
      { status: 500 },
    );
  }
}
