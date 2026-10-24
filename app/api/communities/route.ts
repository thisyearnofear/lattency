import { NextRequest } from "next/server";
import { checkRateLimit, hashIp } from "@/lib/rate-limit";
import { base44Configured } from "@/lib/base44";
import { sanitizeContributorId } from "@/lib/measurements";
import {
  approveLocalCommunity,
  getCommunities,
  getPendingCommunities,
  submitCommunity,
  validateCommunityInput,
  type CommunityInput,
} from "@/lib/events";
import { log, reqIdFrom } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get("city")?.toLowerCase() || undefined;
  const contributor = sanitizeContributorId(
    req.nextUrl.searchParams.get("contributor"),
  );
  const [communities, pending] = await Promise.all([
    getCommunities({ city }),
    Promise.resolve(base44Configured ? [] : getPendingCommunities(contributor)),
  ]);
  return Response.json({ communities, pending, live: base44Configured });
}

export async function POST(req: NextRequest) {
  const reqId = reqIdFrom(req);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }

  if (body.action === "approve") {
    if (base44Configured) {
      return Response.json(
        { error: "approval runs through the Base44 admin, not this route" },
        { status: 403 },
      );
    }
    const id = typeof body.id === "string" ? body.id : "";
    if (!approveLocalCommunity(id)) {
      return Response.json({ error: "submission not found" }, { status: 404 });
    }
    return Response.json({ id, approved: true });
  }

  const error = validateCommunityInput(body);
  if (error) return Response.json({ error }, { status: 400 });

  const ipHash = hashIp(
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
  );
  const allowed = await checkRateLimit(ipHash, { kind: "community" });
  if (!allowed) {
    return Response.json(
      { error: "Rate limited — five registrations per hour. Try again later." },
      { status: 429 },
    );
  }

  const input: CommunityInput = {
    name: String(body.name),
    focus: typeof body.focus === "string" ? body.focus : null,
    lead: typeof body.lead === "string" ? body.lead : null,
    city: String(body.city),
    websiteUrl: typeof body.websiteUrl === "string" ? body.websiteUrl : null,
    lumaUrl: typeof body.lumaUrl === "string" ? body.lumaUrl : null,
    submittedBy: sanitizeContributorId(
      typeof body.contributorId === "string" ? body.contributorId : null,
    ),
  };

  try {
    const community = await submitCommunity(input);
    return Response.json({ ...community, pending: true }, { status: 201 });
  } catch (err) {
    log.error("community submission failed", {
      reqId,
      scope: "contribute.community",
      reason: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { error: "couldn't register community — please try again" },
      { status: 500 },
    );
  }
}