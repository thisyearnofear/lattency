// Claim eligibility — the rule that decides whether a bounty may be paid out.
//
// Why this exists as its own module: the payout route originally paid any
// caller whose bounty had `progress >= target`, with no relationship between
// the claimant and the reading that filled the bounty. Anyone who could read
// a bounty id could drain it, and nothing tied the money to the person who
// produced the evidence. This module is the single place that rule lives, so
// it can be reasoned about (and tested) independently of the HTTP route.
//
// The rule, in order:
//   1. The bounty must be funded (seed-board examples carry no money).
//   2. The bounty must be open/claiming (a paying/paid bounty is terminal).
//   3. It must actually be filled (progress >= target).
//   4. The claimant must present a contributor identity.
//   5. That identity must be one the bounty recorded as having contributed.
//   6. When the identity is a bound Nimiq address, the payout must go to that
//      same address — so funds can only ever reach the wallet that authored
//      the qualifying reading.
//
// Step 6 is what makes the mechanism defensible without accounts: an attacker
// who learns someone else's contributor id can still only trigger a payout
// *to that contributor*. Griefing is limited to paying the rightful party.
//
// Step 1 is the newest and the subtlest. The bundled seed board's progress is
// derived from the live map (lib/bounty-progress.ts), so a seed can genuinely
// reach its target — which would otherwise make an example with no sponsor
// behind it look payable. No sponsor, no payout.
//
// Pure: no DB, no SDK, no clock. Callers gather the inputs.

import { isBoundContributorId } from "./contributor";
import { sanitizeContributorId } from "./measurements";

/** The subset of a bounty the rule needs — keeps this decoupled from storage. */
export interface ClaimableBounty {
  id: string;
  status: string;
  progress: number;
  target: number;
  /** True for the unfunded seed board — see step 1 in the module comment. */
  synthetic?: boolean;
}

export interface ClaimEligibilityInput {
  bounty: ClaimableBounty;
  /** Contributor identity presented by the claimant, if any. */
  contributorId: string | null;
  /** Contributor ids recorded against this bounty (durable store). */
  contributors: string[];
  /** Wallet address the payout would be sent to. */
  payoutAddress: string;
}

export type ClaimEligibility =
  | { eligible: true }
  | { eligible: false; status: 400 | 403; error: string };

/**
 * Statuses a bounty can be claimed from. `claiming` is included deliberately:
 * `update-bounty-progress` flips a completed bounty to `claiming`, so requiring
 * `open` here made every genuinely-completed Base44 bounty permanently
 * unclaimable. Concurrency is handled by the claim lock, not by this status.
 */
const CLAIMABLE_STATUSES = new Set(["open", "claiming"]);

/**
 * Compare two opaque contributor ids for equality, ignoring formatting.
 *
 * Whitespace is stripped on both sides because a Nimiq address is commonly
 * written in space-separated groups, and a bound contributor's id *is* their
 * address. Ids never legitimately contain a space, so normalising can't create
 * a false match — it only stops a differently-formatted address from failing
 * to recognise itself.
 */
function sameContributor(a: string, b: string): boolean {
  const norm = (value: string) =>
    (sanitizeContributorId(value) ?? "").replace(/\s/g, "").toUpperCase();
  const left = norm(a);
  return left.length > 0 && left === norm(b);
}

/** Normalize a Nimiq address for comparison (no whitespace, case-folded). */
function normalizeAddress(value: string): string {
  return (value ?? "").replace(/\s/g, "").toUpperCase();
}

export function evaluateClaimEligibility({
  bounty,
  contributorId,
  contributors,
  payoutAddress,
}: ClaimEligibilityInput): ClaimEligibility {
  // 1 — unfunded examples are never payable, whatever their derived progress
  // says. Checked first because it is the most specific reason, and because a
  // filled seed would otherwise satisfy every later condition.
  if (bounty.synthetic) {
    return {
      eligible: false,
      status: 400,
      error: "this bounty has no sponsor funds behind it and cannot pay out",
    };
  }

  // 2 + 3 — the original preconditions keep their exact wording, since the
  // client already surfaces this string and the failure is not adversarial.
  if (!CLAIMABLE_STATUSES.has(bounty.status)) {
    return { eligible: false, status: 400, error: "bounty not eligible for claim" };
  }
  if (bounty.progress < bounty.target) {
    return { eligible: false, status: 400, error: "bounty not eligible for claim" };
  }

  // 4 — an unattributed claimant cannot be verified against the bounty.
  const claimant = sanitizeContributorId(contributorId);
  if (!claimant) {
    return {
      eligible: false,
      status: 403,
      error: "claim requires the contributor identity that completed this bounty",
    };
  }

  // 5 — a bounty with no recorded contributors is not payable. Failing closed
  // is the point: an unattributed bounty is exactly the old, exploitable state.
  if (contributors.length === 0) {
    return {
      eligible: false,
      status: 403,
      error: "this bounty has no attributed contributors and cannot be claimed",
    };
  }
  if (!contributors.some((c) => sameContributor(c, claimant))) {
    return {
      eligible: false,
      status: 403,
      error: "only a contributor to this bounty can claim it",
    };
  }

  // 6 — for wallet-bound identities, bind the destination to the author.
  if (isBoundContributorId(claimant)) {
    if (normalizeAddress(claimant) !== normalizeAddress(payoutAddress)) {
      return {
        eligible: false,
        status: 403,
        error: "payout must go to the wallet that completed this bounty",
      };
    }
  }

  return { eligible: true };
}
