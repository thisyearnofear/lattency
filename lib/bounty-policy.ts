export const BOUNTY_PAYMENTS_PAUSED =
  "Bounty funding and payouts are paused while payment verification is being completed. No funds will be moved.";

/**
 * Whether bounty funding and payouts are allowed to move money.
 *
 * Env-gated, fail-closed:
 *   - `BOUNTY_DISABLE=1` is the kill switch — checked first, wins over
 *     everything else, and requires no redeploy to re-pause.
 *   - `NIMIQ_PAYOUT_MOCK=1` enables the dev/test path: the funding verifier
 *     short-circuits and payouts are simulated, so no real key is needed.
 *   - Otherwise both real-mode secrets must be present — sponsors need a
 *     `NIMIQ_ESCROW_ADDRESS` to pay into (verified on-chain by
 *     lib/nimiq-verify.ts) and payouts need `NIMIQ_PRIVATE_KEY` to sign with.
 *
 * Client bundles never receive server envs (NIMIQ_PRIVATE_KEY must never
 * ship to a browser), so in the browser the check falls back to the only
 * honest public signal — NEXT_PUBLIC_NIMIQ_ESCROW_ADDRESS. Components use
 * the result only to toggle affordances; the server re-evaluates the real
 * gate on every request, so a stale client answer can never move money.
 *
 * Verified end-to-end on Nimiq testnet: a real 5 NIM escrow deposit was
 * verified by verifyFundingTx and a POST /api/bounties round-trip returned
 * 201 + fundingStatus "verified" (see scripts/verify-testnet-funding.ts).
 */
export function bountyPaymentsEnabled(): boolean {
  if (process.env.BOUNTY_DISABLE === "1") return false;

  if (typeof window !== "undefined") {
    return Boolean(process.env.NEXT_PUBLIC_NIMIQ_ESCROW_ADDRESS);
  }

  if (process.env.NIMIQ_PAYOUT_MOCK === "1") return true;

  return Boolean(
    process.env.NIMIQ_ESCROW_ADDRESS?.trim() &&
      process.env.NIMIQ_PRIVATE_KEY?.trim(),
  );
}
