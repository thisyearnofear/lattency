import { NextRequest } from "next/server";
import { createBounty, getBounties, type BountyCreationInput } from "@/lib/bounties";
import { log, reqIdFrom } from "@/lib/log";

export const dynamic = "force-dynamic";

// GET /api/bounties?city=london
// Returns open bounties, optionally filtered by city.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const city = url.searchParams.get("city") ?? undefined;
  const bounties = await getBounties(city ?? undefined);
  return Response.json({ bounties });
}

// POST /api/bounties
// Body: { goal, area, target, rewardNim, sponsor, sponsorKind, kind, expiresAt }
// Creates a new sponsor-funded bounty. The actual NIM funding transaction
// is performed client-side via the Nimiq SDK before this endpoint is called.
export async function POST(req: NextRequest) {
  const reqId = reqIdFrom(req);
  let body: Partial<BountyCreationInput>;
  try {
    body = (await req.json()) as Partial<BountyCreationInput>;
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }

  const sponsorKinds: BountyCreationInput["sponsorKind"][] = [
    "isp",
    "café",
    "community",
    "anon",
  ];
  const bountyKinds: BountyCreationInput["kind"][] = [
    "first-in-neighbourhood",
    "attribute-match",
    "tier-target",
    "nth-contributor",
  ];

  if (!body.goal || typeof body.goal !== "string" || body.goal.trim().length < 3) {
    return Response.json({ error: "goal required (min 3 characters)" }, { status: 400 });
  }
  if (!body.area || typeof body.area !== "string" || body.area.trim().length < 2) {
    return Response.json({ error: "area required" }, { status: 400 });
  }
  if (!Number.isFinite(body.target) || (body.target as number) < 1) {
    return Response.json({ error: "target must be at least 1" }, { status: 400 });
  }
  if (!Number.isFinite(body.rewardNim) || (body.rewardNim as number) <= 0) {
    return Response.json({ error: "rewardNim must be a positive number" }, { status: 400 });
  }
  if (!body.sponsor || typeof body.sponsor !== "string" || body.sponsor.trim().length < 2) {
    return Response.json({ error: "sponsor name required" }, { status: 400 });
  }
  if (!sponsorKinds.includes(body.sponsorKind as BountyCreationInput["sponsorKind"])) {
    return Response.json({ error: "valid sponsorKind required" }, { status: 400 });
  }
  if (!bountyKinds.includes(body.kind as BountyCreationInput["kind"])) {
    return Response.json({ error: "valid kind required" }, { status: 400 });
  }

  const input: BountyCreationInput = {
    goal: body.goal.trim(),
    area: body.area.trim(),
    target: Number(body.target),
    rewardNim: Number(body.rewardNim),
    sponsor: body.sponsor.trim(),
    sponsorKind: body.sponsorKind as BountyCreationInput["sponsorKind"],
    kind: body.kind as BountyCreationInput["kind"],
    expiresAt:
      typeof body.expiresAt === "string" && body.expiresAt.trim().length > 0
        ? body.expiresAt.trim()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };

  try {
    const bounty = await createBounty(input);
    log.info("bounty created via API", {
      reqId,
      scope: "bounties.create.api",
      bountyId: bounty.id,
      rewardNim: bounty.rewardNim,
    });
    return Response.json({ success: true, bounty }, { status: 201 });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.error("bounty creation failed", { reqId, scope: "bounties.create.api", reason });
    return Response.json({ error: reason }, { status: 500 });
  }
}
