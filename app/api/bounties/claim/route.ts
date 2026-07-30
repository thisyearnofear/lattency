import { NextRequest } from "next/server";
import { executeNimiqPayout } from "@/lib/nimiq-payout";
import { log, reqIdFrom } from "@/lib/log";
import { bountyState, CLAIM_LOCK_TTL_MS } from "@/lib/bounty-state";
import type { Bounty } from "@/lib/bounties";
import { markBountyPaid } from "@/lib/bounties";

export const dynamic = "force-dynamic";

/** How often to refresh the claim lock while a payout is in flight. */
const LOCK_REFRESH_MS = 30_000;

interface ClaimRequest {
  bountyId: string;
  nimiqAddress: string;
}

// Eligibility check against the current fallback + Base44 bounties. In
// production, this would query the live Base44 / Aurora bounties table,
// verify progress, and mark the row as `claiming` under a transaction.
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

  // Lock the bounty for the duration of the claim. TTL is generous so
  // slow RPC broadcasts don't lose exclusivity mid-flight. The lock is
  // refreshed regularly while the payout is in progress.
  const lockToken = await bountyState.tryAcquireClaimLock(bountyId, {
    ttlMs: CLAIM_LOCK_TTL_MS,
  });
  if (!lockToken) {
    return Response.json({ error: "claim already in progress" }, { status: 409 });
  }

  // Keep refreshing the lock from the moment we own it. If the request
  // fails fast, finally will clear the interval before it fires.
  const extendInterval = setInterval(() => {
    bountyState
      .extendClaimLock(bountyId, lockToken, { ttlMs: CLAIM_LOCK_TTL_MS })
      .catch((err) => {
        log.error("failed to extend claim lock", {
          reqId,
          scope: "bounties.claim",
          bountyId,
          reason: err instanceof Error ? err.message : String(err),
        });
      });
  }, LOCK_REFRESH_MS);

  try {
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
    // Log the raw reason server-side but return a generic message to the
    // client — payout internals must not leak to callers.
    const reason = err instanceof Error ? err.message : String(err);
    log.error("bounty claim failed", { reqId, scope: "bounties.claim", reason });
    return Response.json(
      { error: "payout failed — please try again" },
      { status: 500 },
    );
  } finally {
    if (extendInterval) clearInterval(extendInterval);
    try {
      const released = await bountyState.releaseClaimLock(bountyId, lockToken);
      if (!released) {
        log.warn("claim lock was not released (token may have expired)", {
          reqId,
          scope: "bounties.claim",
          bountyId,
        });
      }
    } catch (releaseErr) {
      log.error("failed to release claim lock", {
        reqId,
        scope: "bounties.claim",
        bountyId,
        reason: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
      });
    }
  }
}
