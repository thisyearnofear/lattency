import { NextRequest } from "next/server";
import { executeNimiqPayout } from "@/lib/nimiq-payout";
import { log, reqIdFrom } from "@/lib/log";
import { bountyState, CLAIM_LOCK_TTL_MS } from "@/lib/bounty-state";
import { evaluateClaimEligibility } from "@/lib/bounty-claim";
import { sanitizeContributorId } from "@/lib/measurements";
import type { Bounty } from "@/lib/bounties";
import { markBountyPaid } from "@/lib/bounties";

export const dynamic = "force-dynamic";

/** How often to refresh the claim lock while a payout is in flight. */
const LOCK_REFRESH_MS = 30_000;

interface ClaimRequest {
  bountyId: string;
  nimiqAddress: string;
  /** The contributor identity asserting the claim. Required — see lib/bounty-claim.ts. */
  contributorId?: string;
}

// Look up the bounty being claimed. Eligibility (is it filled? may *this*
// caller claim it?) is decided by evaluateClaimEligibility — this only has to
// find the row. Reads Base44 when configured, the bundled snapshot otherwise.
async function findBounty(bountyId: string): Promise<Bounty | null> {
  const { getBounties } = await import("@/lib/bounties");
  const bounties = await getBounties();
  return bounties.find((b) => b.id === bountyId) ?? null;
}

// POST /api/bounties/claim
// Body: { bountyId, nimiqAddress, contributorId }
//
// Pays out a completed bounty in NIM, but only to a contributor on record for
// that bounty. The eligibility gate is deliberate and lives in
// lib/bounty-claim.ts: without it, any caller who knew a bounty id could drain
// it to their own wallet, with nothing tying the money to the reading that
// filled it.
//
// Ordering note: eligibility is evaluated *before* the lock is acquired, so a
// rejected claim never takes the lock. Taking it first would let anyone lock a
// bounty out from under its rightful claimant just by spamming rejections.
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

  const contributorId = sanitizeContributorId(body.contributorId);

  // ── Eligibility: is this bounty filled, and did this caller fill it? ──────
  let bounty: Bounty;
  try {
    const found = await findBounty(bountyId);
    if (!found) {
      return Response.json({ error: "bounty not eligible for claim" }, { status: 400 });
    }

    const contributors = await bountyState.getContributors(bountyId);
    const eligibility = evaluateClaimEligibility({
      bounty: found,
      contributorId,
      contributors,
      payoutAddress: nimiqAddress,
    });
    if (!eligibility.eligible) {
      log.warn("claim rejected", {
        reqId,
        scope: "bounties.claim",
        bountyId,
        status: eligibility.status,
        reason: eligibility.error,
      });
      return Response.json(
        { error: eligibility.error },
        { status: eligibility.status },
      );
    }
    bounty = found;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.error("claim eligibility check failed", {
      reqId,
      scope: "bounties.claim",
      bountyId,
      reason,
    });
    return Response.json(
      { error: "payout failed — please try again" },
      { status: 500 },
    );
  }

  // ── Lock for the payout window only ──────────────────────────────────────
  // TTL is generous so slow RPC broadcasts don't lose exclusivity mid-flight.
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
    log.info("claiming bounty", {
      reqId,
      scope: "bounties.claim",
      bountyId,
      nimiqAddress,
      contributorId,
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
