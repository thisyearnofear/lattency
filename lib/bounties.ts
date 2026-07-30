// Coffee bounties — pre-funded incentives for verified contributions.
//
// Store layering: the Base44 Bounty entity is the live source of truth.
// When Base44 is unconfigured (offline demo) or cold we fall back to a
// bundled snapshot plus any bounties created in this process. Sponsor-created
// bounties persist to Base44 when it is configured, so they survive
// serverless cold starts instead of evaporating. Payout safety is enforced
// by bountyState (durable lock + paid-set in Redis), independent of which
// read source served the bounty.

import { log } from "./log";
import { base44Configured, getBase44 } from "./base44";
import { b44MarkBountyPaid } from "./base44-data";
import { cityDisplayName } from "./cities";
import { bountyState } from "./bounty-state";

export type { Bounty, BountyKind, BountyCreationInput } from "./bounty-types";
export {
  sponsorBadgeStyle,
  BOUNTY_KINDS,
  BOUNTY_KIND_LABELS,
  bountyKindLabel,
} from "./bounty-types";
import type { Bounty, BountyCreationInput } from "./bounty-types";

/** 1 NIM = 100,000 Lunas. */
const LUNAS_PER_NIM = 100_000;
/** Display price of a NIM bounty in USD (coffees). */
const USD_PER_NIM = 0.05;

// Fallback snapshot served when Base44 is unconfigured or returns no rows.
// This IS the seed data, kept in sync by hand with the Base44 bounty seeds.
const FALLBACK_BOUNTIES: Bounty[] = [
  // — London —
  {
    id: "b-shoreditch-first",
    goal: "First verified café on Brick Lane",
    area: "Shoreditch · London",
    city: "london",
    amountUsd: 5,
    rewardNim: 5,
    target: 1,
    progress: 0,
    sponsor: "@londonremote",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    expiresAt: "2026-08-15",
    status: "open",
  },
  {
    id: "b-hoxton-express-3",
    goal: "3 express-tier cafés around Hoxton Square",
    area: "Hoxton · London",
    city: "london",
    amountUsd: 20,
    rewardNim: 20,
    target: 3,
    progress: 1,
    sponsor: "Community Fibre",
    sponsorKind: "isp",
    kind: "tier-target",
    expiresAt: "2026-08-10",
    status: "open",
  },
  {
    id: "b-old-st-oat",
    goal: "Map 2 oat-milk cafés near Old Street roundabout",
    area: "Old Street · London",
    city: "london",
    amountUsd: 10,
    rewardNim: 10,
    target: 2,
    progress: 1,
    sponsor: "Ozone Coffee Roasters",
    sponsorKind: "café",
    kind: "attribute-match",
    expiresAt: "2026-08-20",
    status: "open",
  },
  {
    id: "b-bethnal-10th",
    goal: "Be the 10th verified speed test in Bethnal Green",
    area: "Bethnal Green · London",
    city: "london",
    amountUsd: 5,
    rewardNim: 5,
    target: 10,
    progress: 4,
    sponsor: "@e2coworker",
    sponsorKind: "community",
    kind: "nth-contributor",
    expiresAt: "2026-08-30",
    status: "open",
  },
  // — Nairobi —
  {
    id: "b-eastleigh-first",
    goal: "First verified café in Eastleigh",
    area: "Eastleigh · Nairobi",
    city: "nairobi",
    amountUsd: 5,
    rewardNim: 5,
    target: 1,
    progress: 0,
    sponsor: "@nairobikiwi",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    expiresAt: "2026-08-15",
    status: "open",
  },
  {
    id: "b-safaricom-kilimani-oat",
    goal: "Map 3 oat-milk cafés in Kilimani",
    area: "Kilimani · Nairobi",
    city: "nairobi",
    amountUsd: 15,
    rewardNim: 15,
    target: 3,
    progress: 1,
    sponsor: "Safaricom Fibre",
    sponsorKind: "isp",
    kind: "attribute-match",
    expiresAt: "2026-08-08",
    status: "open",
  },
  {
    id: "b-cbd-express-5",
    goal: "5 express-tier cafés across CBD",
    area: "CBD · Nairobi",
    city: "nairobi",
    amountUsd: 25,
    rewardNim: 25,
    target: 5,
    progress: 2,
    sponsor: "Liquid Telecom",
    sponsorKind: "isp",
    kind: "tier-target",
    expiresAt: "2026-08-12",
    status: "open",
  },
  {
    id: "b-lavington-first",
    goal: "First verified café in Lavington",
    area: "Lavington · Nairobi",
    city: "nairobi",
    amountUsd: 5,
    rewardNim: 5,
    target: 1,
    progress: 0,
    sponsor: "@workmunyao",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    expiresAt: "2026-08-22",
    status: "open",
  },
  {
    id: "b-savanna-10th-contrib",
    goal: "Be the 10th verified speed test at Savanna Coffee Lounge",
    area: "CBD · Nairobi",
    city: "nairobi",
    amountUsd: 5,
    rewardNim: 5,
    target: 10,
    progress: 6,
    sponsor: "Savanna Coffee Lounge",
    sponsorKind: "café",
    kind: "nth-contributor",
    expiresAt: "2026-08-30",
    status: "open",
  },
  // — San Francisco —
  {
    id: "b-sf-mission-fast-3",
    goal: "3 express-tier cafés in the Mission",
    area: "Mission · San Francisco",
    city: "sf",
    amountUsd: 20,
    rewardNim: 20,
    target: 3,
    progress: 1,
    sponsor: "Sonic.net",
    sponsorKind: "isp",
    kind: "tier-target",
    expiresAt: "2026-08-09",
    status: "open",
  },
  {
    id: "b-sf-hayes-first",
    goal: "First verified café in Hayes Valley",
    area: "Hayes Valley · San Francisco",
    city: "sf",
    amountUsd: 5,
    rewardNim: 5,
    target: 1,
    progress: 0,
    sponsor: "@sfremote",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    expiresAt: "2026-08-18",
    status: "open",
  },
];

/**
 * In-process store for sponsor-created bounties. Used ONLY when Base44 is
 * unconfigured (offline demo) — with Base44 configured, createBounty writes
 * a real entity instead. This array is process-local and does not survive
 * cold starts; that is acceptable because it only backs the no-backend demo.
 */
const CREATED_BOUNTIES: Bounty[] = [];

// Base44 Bounty entity row shape (snake_case, per base44/entities/Bounty.json).
interface BountyEntity {
  id: string;
  title: string;
  description?: string | null;
  reward?: number;
  reward_lunas?: number | null;
  target_city?: string | null;
  target_neighbourhood?: string | null;
  criteria?: string | null;
  target?: number;
  progress?: number;
  sponsor_name?: string | null;
  sponsor_kind?: Bounty["sponsorKind"];
  kind?: Bounty["kind"];
  expires_at?: string | null;
  status?: Bounty["status"];
  claimed_by_address?: string | null;
  tx_hash?: string | null;
}

function rowToBounty(r: BountyEntity): Bounty {
  const rewardNim = r.reward ?? Math.round((r.reward_lunas ?? 0) / LUNAS_PER_NIM);
  return {
    id: r.id,
    goal: r.title,
    area: [r.target_neighbourhood, r.target_city].filter(Boolean).join(" · "),
    city: r.target_city ?? undefined,
    amountUsd: Math.round(rewardNim * USD_PER_NIM * 100) / 100,
    rewardNim,
    target: r.target ?? 1,
    progress: r.progress ?? 0,
    sponsor: r.sponsor_name ?? "Anonymous",
    sponsorKind: r.sponsor_kind ?? "community",
    kind: r.kind ?? "first-in-neighbourhood",
    expiresAt: r.expires_at ?? "",
    status: r.status ?? "open",
    claimedByAddress: r.claimed_by_address,
    txHash: r.tx_hash,
  };
}

/** Split an "Area · City" display string into its parts. */
function splitArea(area: string): { neighbourhood: string; city: string | null } {
  const parts = area.split("·").map((p) => p.trim());
  if (parts.length >= 2) {
    return { neighbourhood: parts[0], city: parts[parts.length - 1].toLowerCase() };
  }
  return { neighbourhood: area, city: null };
}

/** Synthetic founder-bounty id prefix. */
const FOUNDER_PREFIX = "synth-founder-";

export function buildFounderBounty(city: string): Bounty {
  const name = cityDisplayName(city);
  return {
    id: `${FOUNDER_PREFIX}${city}`,
    goal: `First café in ${name}`,
    area: `${name} · Founder reward`,
    city,
    amountUsd: 2.5,
    rewardNim: 50,
    target: 1,
    progress: 0,
    sponsor: "Lattency",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    // Never expires — once a city is live the founder opportunity is taken.
    expiresAt: "2099-12-31",
    status: "open",
  };
}

function injectFounderBounty(
  bounties: Bounty[],
  city: string | undefined,
  cafeCount: number | undefined,
): Bounty[] {
  if (!city || cafeCount !== 0) return bounties;
  const hasReal = bounties.some(
    (b) => b.city === city && b.kind === "first-in-neighbourhood",
  );
  if (hasReal) return bounties;
  return [buildFounderBounty(city), ...bounties];
}

/** Today as YYYY-MM-DD for inline expiry comparison. */
function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** True when a bounty is past its expiry date. */
function isExpired(bounty: Bounty, now: string): boolean {
  return Boolean(bounty.expiresAt) && bounty.expiresAt < now;
}

/**
 * Returns the open coffee bounties — those not yet paid out or expired.
 * Reads from Base44 when configured; falls back to the bundled snapshot +
 * in-process creations otherwise. Inline expiry replaces the legacy
 * expire-bounties cron automation.
 * When `city` is provided, only bounties for that city are returned.
 * When `cafeCount` is 0, a synthetic founder bounty is injected so newly
 * activated cities still have an incentive to map the first station.
 */
export async function getBounties(city?: string, cafeCount?: number): Promise<Bounty[]> {
  const now = todayStamp();

  let source: Bounty[];
  if (base44Configured) {
    try {
      const rows = (await getBase44().entities.Bounty.filter(
        { status: { $ne: "paid" } },
        "-created_date",
        100,
        0,
      )) as unknown as BountyEntity[];
      source = rows.map(rowToBounty);
    } catch (err) {
      log.warn("getBounties: Base44 read failed, serving fallback", {
        scope: "bounties",
        reason: err instanceof Error ? err.message : String(err),
      });
      source = [...FALLBACK_BOUNTIES, ...CREATED_BOUNTIES];
    }
  } else {
    source = [...FALLBACK_BOUNTIES, ...CREATED_BOUNTIES];
  }

  // Inline expiry applies to every source; paid bounties are filtered via the
  // durable bountyState set so a claimed bounty stays hidden across instances.
  const paidIds = new Set(await bountyState.getPaidBounties());
  const live = source.filter((b) => !isExpired(b, now) && !paidIds.has(b.id));

  if (city) {
    const cityLive = live.filter((b) => !b.city || b.city === city);
    return injectFounderBounty(cityLive, city, cafeCount);
  }
  return live;
}

/** Reset mutable bounty state. Exported only for tests. */
export async function __resetBountyStateForTests(): Promise<void> {
  await bountyState.resetForTests();
  CREATED_BOUNTIES.length = 0;
  for (const b of FALLBACK_BOUNTIES) {
    b.status = "open";
    b.claimedByAddress = undefined;
    b.txHash = undefined;
  }
}

/**
 * Create a new bounty. When Base44 is configured this persists a real
 * entity (durable across cold starts); otherwise it lands in the
 * process-local in-memory store. Returns the created bounty.
 */
export async function createBounty(input: BountyCreationInput): Promise<Bounty> {
  const area = splitArea(input.area.trim());
  const base: Omit<Bounty, "id"> = {
    goal: input.goal.trim(),
    area: input.area.trim(),
    city: area.city ?? undefined,
    amountUsd: Math.round(input.rewardNim * USD_PER_NIM * 100) / 100,
    rewardNim: input.rewardNim,
    target: input.target,
    progress: 0,
    sponsor: input.sponsor.trim(),
    sponsorKind: input.sponsorKind,
    kind: input.kind,
    expiresAt: input.expiresAt,
    status: "open",
  };

  if (base44Configured) {
    try {
      const created = (await getBase44().entities.Bounty.create({
        title: base.goal,
        description: base.sponsor,
        reward: base.rewardNim,
        currency: "NIM",
        reward_lunas: base.rewardNim * LUNAS_PER_NIM,
        target_city: base.city ?? null,
        target_neighbourhood: area.neighbourhood,
        criteria: base.kind,
        target: base.target,
        progress: 0,
        sponsor_name: base.sponsor,
        sponsor_kind: base.sponsorKind,
        kind: base.kind,
        expires_at: base.expiresAt,
        active: true,
        status: "open",
      })) as { id: string };
      const bounty: Bounty = { ...base, id: created.id };
      log.info("bounty created (Base44)", {
        scope: "bounties.create",
        bountyId: bounty.id,
        rewardNim: bounty.rewardNim,
      });
      return bounty;
    } catch (err) {
      // Persist failed — fall back to in-memory so the sponsor still sees a
      // confirmation. Degrades to the offline-demo behaviour.
      log.warn("createBounty: Base44 create failed, storing in-memory", {
        scope: "bounties.create",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const bounty: Bounty = {
    ...base,
    id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  CREATED_BOUNTIES.push(bounty);
  log.info("bounty created (in-memory)", {
    scope: "bounties.create",
    bountyId: bounty.id,
    rewardNim: bounty.rewardNim,
  });
  return bounty;
}

/**
 * Persist a bounty as paid. Always records the payout in the durable
 * bountyState set (the double-claim guard); when Base44 is configured it
 * also updates the entity. Best-effort: a Base44 failure still marks the
 * local mirror so the same process can't double-claim while it's down.
 */
export async function markBountyPaid(
  bountyId: string,
  claimedByAddress: string,
  txHash: string,
): Promise<void> {
  // Fallback/created bounties live only in memory; don't waste a Base44 call.
  const inMemory =
    CREATED_BOUNTIES.find((b) => b.id === bountyId) ??
    FALLBACK_BOUNTIES.find((b) => b.id === bountyId);

  if (!inMemory && base44Configured) {
    // Persist to Base44 first so the source of truth updates before the
    // in-memory mirror.
    const ok = await b44MarkBountyPaid(bountyId, claimedByAddress, txHash);
    if (!ok) {
      log.error("Base44 bounty paid update failed", { scope: "bounties.paid", bountyId });
    }
  }

  if (inMemory) {
    inMemory.status = "paid";
    inMemory.claimedByAddress = claimedByAddress;
    inMemory.txHash = txHash;
  }

  await bountyState.markPaid(bountyId);

  log.info("bounty marked paid", {
    scope: "bounties.paid",
    bountyId,
    claimedByAddress,
    txHash,
  });
}

/**
 * Create a real Base44 Bounty entity representing the founder reward for a
 * newly activated city. Called when the first café in a city is created.
 * Idempotent — returns the existing entity id if the founder bounty for
 * this city already exists. Returns null when Base44 is unavailable.
 */
export async function createFounderBountyEntity(city: string): Promise<string | null> {
  if (!base44Configured) return null;
  const name = cityDisplayName(city);
  try {
    const existing = (await getBase44().entities.Bounty.filter(
      { target_city: city, criteria: "first-cafe" },
      "-created_date",
      1,
      0,
    )) as unknown as Array<{ id: string }>;
    if (existing.length > 0) {
      return existing[0].id;
    }

    const created = (await getBase44().entities.Bounty.create({
      title: `First café in ${name}`,
      description: `Founder reward for the first café mapped in ${name}`,
      reward: 50,
      currency: "NIM",
      reward_lunas: 50 * LUNAS_PER_NIM,
      target_city: city,
      target_neighbourhood: "",
      criteria: "first-cafe",
      target: 1,
      progress: 1,
      sponsor_name: "Lattency",
      sponsor_kind: "community",
      kind: "first-in-neighbourhood",
      expires_at: "2099-12-31",
      active: true,
      status: "open",
    })) as { id: string };
    log.info("founder bounty entity created", { scope: "bounties.founder.create", city, bountyId: created.id });
    return created.id;
  } catch (err) {
    log.warn("founder bounty entity creation failed", {
      scope: "bounties.founder.create",
      city,
      reason: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
