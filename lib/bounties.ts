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

// Fallback snapshot served when Aurora is cold or returns no rows. Mirrors
// the seed file so the UI is byte-for-byte the same as a live read.
const FALLBACK_BOUNTIES: Bounty[] = [
  {
    id: "b-eastleigh-first",
    goal: "First verified café in Eastleigh",
    area: "Eastleigh · Nairobi",
    amountUsd: 5,
    rewardNim: 5,
    target: 1,
    progress: 0,
    sponsor: "@nairobikiwi",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    expiresAt: "2026-07-15",
    status: "open",
  },
  {
    id: "b-safaricom-kilimani-oat",
    goal: "Map 3 oat-milk cafés in Kilimani",
    area: "Kilimani · Nairobi",
    amountUsd: 15,
    rewardNim: 15,
    target: 3,
    progress: 1,
    sponsor: "Safaricom Fibre",
    sponsorKind: "isp",
    kind: "attribute-match",
    expiresAt: "2026-07-08",
    status: "open",
  },
  {
    id: "b-cbd-express-5",
    goal: "5 express-tier cafés across CBD",
    area: "CBD · Nairobi",
    amountUsd: 25,
    rewardNim: 25,
    target: 5,
    progress: 2,
    sponsor: "Liquid Telecom",
    sponsorKind: "isp",
    kind: "tier-target",
    expiresAt: "2026-07-12",
    status: "open",
  },
  {
    id: "b-lavington-first",
    goal: "First verified café in Lavington",
    area: "Lavington · Nairobi",
    amountUsd: 5,
    rewardNim: 5,
    target: 1,
    progress: 0,
    sponsor: "@workmunyao",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    expiresAt: "2026-07-22",
    status: "open",
  },
  {
    id: "b-sf-mission-fast-3",
    goal: "3 express-tier cafés in the Mission",
    area: "Mission · San Francisco",
    amountUsd: 20,
    rewardNim: 20,
    target: 3,
    progress: 1,
    sponsor: "Sonic.net",
    sponsorKind: "isp",
    kind: "tier-target",
    expiresAt: "2026-07-09",
    status: "open",
  },
  {
    id: "b-savanna-10th-contrib",
    goal: "Be the 10th verified speed test at Savanna Coffee Lounge",
    area: "CBD · Nairobi",
    amountUsd: 5,
    rewardNim: 5,
    target: 10,
    progress: 6,
    sponsor: "Savanna Coffee Lounge",
    sponsorKind: "café",
    kind: "nth-contributor",
    expiresAt: "2026-07-30",
    status: "open",
  },
];

interface BountyRow {
  id: string;
  goal: string;
  area: string;
  amount_usd: string | number;
  reward_nim: string | number;
  target: number;
  progress: number;
  sponsor_name: string;
  sponsor_kind: string;
  kind: string;
  expires_at: string | Date | null;
  status: string;
  claimed_by_address: string | null;
  tx_hash: string | null;
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
    rewardNim: Number(r.reward_nim),
    target: r.target,
    progress: r.progress,
    sponsor: r.sponsor_name,
    sponsorKind: r.sponsor_kind as Bounty["sponsorKind"],
    kind: r.kind as BountyKind,
    expiresAt,
    status: r.status as Bounty["status"],
    claimedByAddress: r.claimed_by_address,
    txHash: r.tx_hash,
  };
}

/**
 * Returns the open coffee bounties — those not yet paid out and either
 * still in their funding window or open-ended. Ordered by soonest expiry.
 */
export async function getBounties(): Promise<Bounty[]> {
  let dbBounties: Bounty[] = [];
  try {
    const result = await query<BountyRow>(`
      SELECT id, goal, area, amount_usd, target, progress, sponsor_name,
             sponsor_kind, kind, expires_at
      FROM bounties
      WHERE NOT paid_out
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY expires_at ASC NULLS LAST
    `);
    dbBounties = result.rows.map(rowToBounty);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.warn("getBounties: serving fallback", { scope: "bounties", reason });
  }

  const merged =
    dbBounties.length > 0
      ? [...dbBounties, ...CREATED_BOUNTIES]
      : [...FALLBACK_BOUNTIES, ...CREATED_BOUNTIES];

  return merged;
}

/**
 * In-memory store for sponsor-created bounties. This lets the /partners
 * dashboard create real bounty entries without a working Aurora/Base44
 * write path. In production this is replaced by a database INSERT.
 */
const CREATED_BOUNTIES: Bounty[] = [];

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

/**
 * Create a new bounty. Returns the created bounty with a generated id.
 */
export async function createBounty(input: BountyCreationInput): Promise<Bounty> {
  const bounty: Bounty = {
    id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    goal: input.goal.trim(),
    area: input.area.trim(),
    amountUsd: Math.round(input.rewardNim * 0.05 * 100) / 100,
    rewardNim: input.rewardNim,
    target: input.target,
    progress: 0,
    sponsor: input.sponsor.trim(),
    sponsorKind: input.sponsorKind,
    kind: input.kind,
    expiresAt: input.expiresAt,
    status: "open",
  };

  CREATED_BOUNTIES.push(bounty);
  log.info("bounty created", { scope: "bounties.create", bountyId: bounty.id, rewardNim: bounty.rewardNim });

  return bounty;
}

/**
 * Mark a bounty as paid. Searches the in-memory fallback + created stores.
 * In production this would update the database row.
 */
export async function markBountyPaid(
  bountyId: string,
  claimedByAddress: string,
  txHash: string,
): Promise<void> {
  const bounty =
    CREATED_BOUNTIES.find((b) => b.id === bountyId) ??
    FALLBACK_BOUNTIES.find((b) => b.id === bountyId);
  if (!bounty) return;

  bounty.status = "paid";
  bounty.claimedByAddress = claimedByAddress;
  bounty.txHash = txHash;

  log.info("bounty marked paid", {
    scope: "bounties.paid",
    bountyId,
    claimedByAddress,
    txHash,
  });
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
