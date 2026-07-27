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
