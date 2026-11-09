import { NextRequest } from "next/server";
import { createBounty, getBounties, type BountyCreationInput } from "@/lib/bounties";
import { checkRateLimit, hashIp } from "@/lib/rate-limit";
import { bountyPaymentsEnabled, BOUNTY_PAYMENTS_PAUSED } from "@/lib/bounty-policy";
import { verifyFundingTx } from "@/lib/nimiq-verify";
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
// Body: { goal, area, target, rewardNim, sponsor, sponsorKind, kind, expiresAt,
//         fundingTxHash, clientIntentId }
// Creates a new sponsor-funded bounty. The client pays the escrow via the
// Nimiq SDK first, then submits the funding tx hash for server-side
// verification (lib/nimiq-verify.ts) before the bounty is trusted as backed.
// clientIntentId is an idempotency key: a retry of the same funding intent
// returns the already-created bounty instead of minting a duplicate.
export async function POST(req: NextRequest) {
  if (!bountyPaymentsEnabled()) {
    return Response.json(
      { error: BOUNTY_PAYMENTS_PAUSED, code: "BOUNTY_PAYMENTS_PAUSED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const reqId = reqIdFrom(req);

  // Spam protection for the board — bounties are funded client-side, so this
  // caps how many one IP can post per hour.
  const ipHash = hashIp(
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
  );
  const allowed = await checkRateLimit(ipHash, { kind: "bounty" });
  if (!allowed) {
    return Response.json(
      { error: "Rate limited — too many bounties from this address. Try again in an hour." },
      { status: 429 },
    );
  }

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

  // Funding proof, required since verification shipped: no tx hash means no
  // money behind the bounty, and no intent id means a retried request would
  // double-create.
  const fundingTxHash =
    typeof body.fundingTxHash === "string" ? body.fundingTxHash.trim() : "";
  const clientIntentId =
    typeof body.clientIntentId === "string" ? body.clientIntentId.trim() : "";
  if (!fundingTxHash) {
    return Response.json(
      { error: "fundingTxHash required — pay the escrow first" },
      { status: 400 },
    );
  }
  if (!clientIntentId) {
    return Response.json({ error: "clientIntentId required" }, { status: 400 });
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

  // Dedup on the client intent first. A sponsor whose first response was lost
  // retries with the SAME intent id AND the same tx hash — returning the
  // existing bounty is the correct idempotent answer, and doing this before
  // the replay check keeps that legitimate retry from tripping the txHash
  // guard (the replay guard exists for a DIFFERENT intent reusing one deposit).
  const board = await getBounties();
  const priorIntent = board.find((b) => b.clientIntentId === clientIntentId);
  if (priorIntent) {
    return Response.json(
      { success: true, bounty: priorIntent, duplicate: true },
      { status: 200 },
    );
  }

  // Prove the escrow deposit on-chain. rewardNim is validated above, so the
  // minimum acceptable value is the advertised reward in Lunas.
  const verification = await verifyFundingTx(
    fundingTxHash,
    Math.floor(input.rewardNim * 100_000),
    process.env.NIMIQ_ESCROW_ADDRESS,
  );
  if (!verification.ok) {
    log.warn("bounty funding verification failed", {
      reqId,
      scope: "bounties.create.verify",
      reason: verification.reason,
    });
    // Infrastructure failures (verification not configured, RPC down) are
    // the server's problem → 502. Everything else is the client's tx → 400.
    const status =
      verification.reason === "not-configured" || verification.reason === "rpc-error"
        ? 502
        : 400;
    return Response.json(
      { error: "funding transaction could not be verified", reason: verification.reason },
      { status },
    );
  }

  // Replay guard: one escrow deposit funds exactly one bounty. Scans the live
  // board — a spent tx hash on an already-expired bounty is an accepted edge
  // (the read path only surfaces live rows).
  const spent = board.find(
    (b) =>
      b.fundingTxHash &&
      b.fundingTxHash.toLowerCase() === verification.txHash.toLowerCase(),
  );
  if (spent) {
    return Response.json(
      { error: "funding transaction already used", bountyId: spent.id },
      { status: 409 },
    );
  }

  try {
    const bounty = await createBounty({
      ...input,
      fundingTxHash: verification.txHash,
      clientIntentId,
      fundingStatus: "verified",
    });
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
