// Coffee bounties — pre-funded incentives for verified contributions.
// Backed by Base44's Bounty entity (see base44/entities/Bounty.json), with
// an in-memory + bundled fallback so the demo always renders even when
// Base44 is unconfigured or cold. The fallback IS the seed data, kept in
// sync by hand — see seeds/sponsorships_bounties.sql.

import { log } from "./log";
import { base44Configured, getBase44 } from "./base44";

export type { Bounty, BountyKind, BountyCreationInput } from "./bounty-types";
export {
  sponsorBadgeStyle,
  BOUNTY_KINDS,
  BOUNTY_KIND_LABELS,
  bountyKindLabel,
} from "./bounty-types";
import type { Bounty, BountyCreationInput } from "./bounty-types";

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
  title: string;
  description: string | null;
  reward: string | number;
  reward_lunas: string | number | null;
  target_city: string | null;
  target_neighbourhood: string | null;
  criteria: string | null;
  status: string;
  claimed_by_address: string | null;
  tx_hash: string | null;
}

function rowToBounty(r: BountyRow): Bounty {
  return {
    id: r.id,
    goal: r.title,
    area: [r.target_neighbourhood, r.target_city].filter(Boolean).join(" · "),
    amountUsd: Math.round(Number(r.reward) * 0.05 * 100) / 100,
    rewardNim: Number(r.reward),
    target: 1,
    progress: r.status === "paid" ? 1 : 0,
    sponsor: r.description ?? "Anonymous",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    expiresAt: "",
    status: r.status as Bounty["status"],
    claimedByAddress: r.claimed_by_address,
    txHash: r.tx_hash,
  };
}

/**
 * Returns the open coffee bounties — those not yet paid out. Reads from
 * Base44 when configured; falls back to the bundled snapshot otherwise.
 */
export async function getBounties(): Promise<Bounty[]> {
  let dbBounties: Bounty[] = [];

  if (base44Configured) {
    try {
      const rows = (await getBase44().entities.Bounty.filter(
        { status: { $ne: "paid" } },
        "-created_date",
        100,
        0,
      )) as unknown as BountyRow[];
      dbBounties = rows.map(rowToBounty);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log.warn("getBounties: Base44 read failed, serving fallback", { scope: "bounties", reason });
    }
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
