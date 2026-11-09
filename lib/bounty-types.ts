// Client-safe bounty types + pure display helpers. Kept free of any
// server-only imports (no `./db`, no `pg`) so client components like
// sponsor-dashboard.tsx can import from here without pulling Postgres
// into the browser bundle. lib/bounties.ts re-exports these so the
// existing server-side import surface is unchanged.

export type BountyKind =
  | "first-in-neighbourhood"
  | "attribute-match"
  | "tier-target"
  | "nth-contributor";

export interface Bounty {
  id: string;
  /** Display label that reads in one line. */
  goal: string;
  /** Lowercase neighbourhood or city context, used for the location pill. */
  area: string;
  /** City id this bounty belongs to (e.g. "london", "nairobi", "sf"). */
  city?: string;
  /** Bounty payout in USD (coffees). The UI renders ☕ × ceil(amount/5). */
  amountUsd: number;
  /** Bounty payout in NIM (1 NIM = 100,000 Lunas). */
  rewardNim: number;
  /** How many contributions count, total. */
  target: number;
  /** How many have been counted so far. */
  progress: number;
  /** Sponsor display name. */
  sponsor: string;
  /** Sponsor type — used to colour-code the badge. */
  sponsorKind: "isp" | "café" | "community" | "anon";
  /** Bounty mechanic, for the badge label. */
  kind: BountyKind;
  /** Expiry as an ISO date — keeps the demo data evergreen. */
  expiresAt: string;
  /** Lifecycle state of the bounty payout. */
  status: "open" | "claiming" | "paid";
  /** Nimiq address that claimed this bounty (if paid). */
  claimedByAddress?: string | null;
  /** On-chain transaction hash for the payout (if paid). */
  txHash?: string | null;
  /**
   * True for the bundled seed board — an unfunded example shown so the
   * mechanic is visible before the first sponsor arrives.
   *
   * There is no money behind an unfunded bounty, so it is never payable. Every
   * payout-adjacent surface must check this before promising a reward: the
   * claim rule refuses it (lib/bounty-claim.ts), notifications stay silent
   * about a "reward waiting", and the UI offers "Fund this bounty" instead of
   * a claim button. Its `progress` is derived from the live map rather than
   * authored (lib/bounty-progress.ts).
   *
   * Absent for every real bounty, including sponsor-created ones.
   */
  synthetic?: boolean;
  /**
   * On-chain hash of the sponsor's escrow funding transaction, verified
   * server-side at creation (lib/nimiq-verify.ts). Present on every
   * sponsor-created bounty; absent on seeds, founder rewards, and anything
   * authored before funding verification existed.
   */
  fundingTxHash?: string;
  /**
   * Whether the escrow deposit behind this bounty was verified on-chain.
   * Only `"unverified"` is meaningful for gating: absent means the row
   * predates verification (founder rewards, admin-created rows) and is
   * treated as funded; `"verified"` is written for sponsor-created bounties
   * after verifyFundingTx confirms the deposit.
   */
  fundingStatus?: "verified" | "unverified";
  /**
   * Idempotency key minted by the sponsoring client (crypto.randomUUID) and
   * echoed on every retry of the same funding intent. The create route
   * dedupes on it so a lost response can't double-create a bounty.
   */
  clientIntentId?: string;
}

export interface BountyCreationInput {
  goal: string;
  area: string;
  target: number;
  rewardNim: number;
  sponsor: string;
  sponsorKind: Bounty["sponsorKind"];
  kind: BountyKind;
  expiresAt: string;
  /** Escrow funding tx hash supplied by the client; verified before create. */
  fundingTxHash?: string;
  /** Client-minted idempotency key for the funding intent. */
  clientIntentId?: string;
  /** Set to "verified" by the create route once the funding tx checks out. */
  fundingStatus?: "verified" | "unverified";
}

export function sponsorBadgeStyle(
  kind: Bounty["sponsorKind"],
): { bg: string; ink: string; label: string } {
  switch (kind) {
    case "isp":
      return { bg: "bg-express", ink: "text-cream", label: "ISP-funded" };
    case "café":
      return { bg: "bg-ink", ink: "text-cream", label: "Café-funded" };
    case "community":
      return { bg: "bg-local", ink: "text-cream", label: "Community" };
    case "anon":
      return { bg: "bg-cream-deep", ink: "text-ink", label: "Anonymous" };
  }
}

export const BOUNTY_KINDS: BountyKind[] = [
  "first-in-neighbourhood",
  "attribute-match",
  "tier-target",
  "nth-contributor",
];

export const BOUNTY_KIND_LABELS: Record<BountyKind, string> = {
  "first-in-neighbourhood": "First in area",
  "attribute-match": "Attribute match",
  "tier-target": "Tier target",
  "nth-contributor": "Nth contributor",
};

export function bountyKindLabel(kind: BountyKind): string {
  switch (kind) {
    case "first-in-neighbourhood":
      return "first-in-area";
    case "attribute-match":
      return "attribute match";
    case "tier-target":
      return "tier target";
    case "nth-contributor":
      return "nth contributor";
  }
}
