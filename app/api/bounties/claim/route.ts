import { NextRequest } from "next/server";
import { executeNimiqPayout } from "@/lib/nimiq-payout";
import { log, reqIdFrom } from "@/lib/log";
import type { Bounty } from "@/lib/bounties";
import { markBountyPaid } from "@/lib/bounties";

export const dynamic = "force-dynamic";

// In-memory lock so a single request can't double-claim while the mock payout
// is in flight. Production would lean on the DB row lock.
const claiming = new Set<string>();

interface ClaimRequest {
  bountyId: string;
  nimiqAddress: string;
}

// Mock eligibility check against the current fallback bounties. In production,
// this would query the live Base44 / Aurora bounties table, verify progress,
// and mark the row as `claiming` under a transaction.
async function findEligibleBounty(
  bountyId: string,
): Promise<Bounty | null> {
  const { getBounties } = await import("@/lib/bounties");
  const bounties = await getBounties();
  const bounty = bounties.find((b) => b.id === bountyId);
  if (!bounty) return null;
  if (bounty.status !== "open") return null;
  if (bounty.progress < bounty.target) return null;
  return bounty;
}

// POST /api/bounties/claim
// Body: { bountyId, nimiqAddress }
// Verifies the bounty is complete and pays out the NIM reward.
export async function POST(req: NextRequest) {
  const reqId = reqIdFrom(req);
  let body: ClaimRequest;
  try {
    body = (await req.json()) as ClaimRequest;
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }

  const { bountyId, nimiqAddress } = body;
  if (!bountyId || typeof bountyId !== "string") {
    return Response.json({ error: "bountyId required" }, { status: 400 });
  }
  if (!nimiqAddress || typeof nimiqAddress !== "string" || !nimiqAddress.startsWith("NQ")) {
    return Response.json({ error: "valid Nimiq address required" }, { status: 400 });
  }

  if (claiming.has(bountyId)) {
    return Response.json({ error: "claim already in progress" }, { status: 409 });
  }

  try {
    claiming.add(bountyId);

    const bounty = await findEligibleBounty(bountyId);
    if (!bounty) {
      return Response.json({ error: "bounty not eligible for claim" }, { status: 400 });
    }

    log.info("claiming bounty", {
      reqId,
      scope: "bounties.claim",
      bountyId,
      nimiqAddress,
      rewardNim: bounty.rewardNim,
    });

    const { txHash } = await executeNimiqPayout(nimiqAddress, bounty.rewardNim);

    await markBountyPaid(bountyId, nimiqAddress, txHash);

    return Response.json({
      success: true,
      bountyId,
      rewardNim: bounty.rewardNim,
      txHash,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.error("bounty claim failed", { reqId, scope: "bounties.claim", reason });
    return Response.json({ error: reason }, { status: 500 });
  } finally {
    claiming.delete(bountyId);
  }
}
