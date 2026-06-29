// Coffee bounties — pre-funded incentives for verified contributions.
// The mechanic: a sponsor stakes a small amount of coffee money for a
// specific target (first verified café in a neighbourhood, N cafés with
// oat milk, Nth contributor, etc). When contributors meet the target and
// the readings are verified by others, the bounty pays out.
//
// This file is the demo dataset that powers the BountiesBoard component.
// The real version would back this with a `bounties` table and a Stripe
// (or M-Pesa) hold/release flow. For the hackathon it shows the model
// concretely without standing up payment infrastructure.

export type BountyKind =
  | "first-in-neighbourhood"   // first verified café in a specific area
  | "attribute-match"          // N cafés with a specific metadata attribute
  | "tier-target"              // N cafés on a specific speed tier
  | "nth-contributor";         // the Nth verified contributor at a café

export interface Bounty {
  id: string;
  /** Display label that reads in one line. */
  goal: string;
  /** Lowercase neighbourhood or city context, used for the location pill. */
  area: string;
  /** Bounty payout in USD (coffees). The UI renders ☕ × ceil(amount/5). */
  amountUsd: number;
  /** How many contributions count, total. */
  target: number;
  /** How many have been counted so far. */
  progress: number;
  /** Sponsor display name. */
  sponsor: string;
  /** Sponsor type — used to colour-code the badge. */
  sponsorKind: "isp" | "community" | "café" | "anon";
  /** Bounty mechanic, for the badge label. */
  kind: BountyKind;
  /** Expiry as a plain ISO date — keeps the demo data evergreen. */
  expiresAt: string;
}

// A snapshot of open bounties. Mixed sponsor types deliberately —
// ISP-funded, community-funded, café-owner-funded — to show the model is
// two-sided (and three-sided when contributors fund their own area).
export const BOUNTIES: Bounty[] = [
  {
    id: "b-eastleigh-first",
    goal: "First verified café in Eastleigh",
    area: "Eastleigh · Nairobi",
    amountUsd: 5,
    target: 1,
    progress: 0,
    sponsor: "@nairobikiwi",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    expiresAt: "2026-07-15",
  },
  {
    id: "b-safaricom-kilimani-oat",
    goal: "Map 3 oat-milk cafés in Kilimani",
    area: "Kilimani · Nairobi",
    amountUsd: 15,
    target: 3,
    progress: 1,
    sponsor: "Safaricom Fibre",
    sponsorKind: "isp",
    kind: "attribute-match",
    expiresAt: "2026-07-08",
  },
  {
    id: "b-cbd-express-5",
    goal: "5 express-tier cafés across CBD",
    area: "CBD · Nairobi",
    amountUsd: 25,
    target: 5,
    progress: 2,
    sponsor: "Liquid Telecom",
    sponsorKind: "isp",
    kind: "tier-target",
    expiresAt: "2026-07-12",
  },
  {
    id: "b-lavington-first",
    goal: "First verified café in Lavington",
    area: "Lavington · Nairobi",
    amountUsd: 5,
    target: 1,
    progress: 0,
    sponsor: "@workmunyao",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    expiresAt: "2026-07-22",
  },
  {
    id: "b-sf-mission-fast-3",
    goal: "3 express-tier cafés in the Mission",
    area: "Mission · San Francisco",
    amountUsd: 20,
    target: 3,
    progress: 1,
    sponsor: "Sonic.net",
    sponsorKind: "isp",
    kind: "tier-target",
    expiresAt: "2026-07-09",
  },
  {
    id: "b-savanna-10th-contrib",
    goal: "Be the 10th verified speed test at Savanna Coffee Lounge",
    area: "CBD · Nairobi",
    amountUsd: 5,
    target: 10,
    progress: 6,
    sponsor: "Savanna Coffee Lounge",
    sponsorKind: "café",
    kind: "nth-contributor",
    expiresAt: "2026-07-30",
  },
];

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
