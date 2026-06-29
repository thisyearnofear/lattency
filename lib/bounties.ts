// Coffee bounties — pre-funded incentives for verified contributions.
// Backed by the `bounties` table created in migration 0007. Falls back to
// the bundled snapshot when Aurora is unreachable so the demo still
// renders. The fallback IS the seed file's data, kept in sync by hand —
// see seeds/sponsorships_bounties.sql.

import { query } from "./db";
import { log } from "./log";

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
  /** Bounty payout in USD (coffees). The UI renders ☕ × ceil(amount/5). */
  amountUsd: number;
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
}

// Fallback snapshot served when Aurora is cold or returns no rows. Mirrors
// the seed file so the UI is byte-for-byte the same as a live read.
const FALLBACK_BOUNTIES: Bounty[] = [
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

interface BountyRow {
  id: string;
  goal: string;
  area: string;
  amount_usd: string | number;
  target: number;
  progress: number;
  sponsor_name: string;
  sponsor_kind: string;
  kind: string;
  expires_at: string | Date | null;
}

function rowToBounty(r: BountyRow): Bounty {
  const expiresAt =
    r.expires_at instanceof Date
      ? r.expires_at.toISOString()
      : r.expires_at ?? "";
  return {
    id: r.id,
    goal: r.goal,
    area: r.area,
    amountUsd: Number(r.amount_usd),
    target: r.target,
    progress: r.progress,
    sponsor: r.sponsor_name,
    sponsorKind: r.sponsor_kind as Bounty["sponsorKind"],
    kind: r.kind as BountyKind,
    expiresAt,
  };
}

/**
 * Returns the open coffee bounties — those not yet paid out and either
 * still in their funding window or open-ended. Ordered by soonest expiry.
 */
export async function getBounties(): Promise<Bounty[]> {
  try {
    const result = await query<BountyRow>(`
      SELECT id, goal, area, amount_usd, target, progress, sponsor_name,
             sponsor_kind, kind, expires_at
      FROM bounties
      WHERE NOT paid_out
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY expires_at ASC NULLS LAST
    `);
    if (result.rows.length === 0) return FALLBACK_BOUNTIES;
    return result.rows.map(rowToBounty);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.warn("getBounties: serving fallback", { scope: "bounties", reason });
    return FALLBACK_BOUNTIES;
  }
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
