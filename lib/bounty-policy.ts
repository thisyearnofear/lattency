export const BOUNTY_PAYMENTS_PAUSED =
  "Bounty funding and payouts are paused while payment verification is being completed. No funds will be moved.";

export function bountyPaymentsEnabled(): boolean {
  return false;
}
