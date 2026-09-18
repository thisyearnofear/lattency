// Notification triggers — the "pull the user back" half of retention.
//
// These are computed on read (GET /api/notifications) rather than pushed, so
// there is no cron job or email infra to stand up: the TopNav inbox polls
// this endpoint and surfaces the open loops. Three triggers, matching the
// retention plan:
//
//   1. Stale stations   — a café the contributor touched is fading (loss aversion)
//   2. Expiring bounties — an open bounty in their city expires within 3 days (scarcity)
//   3. Claimable bounties — a bounty reached its target and awaits claiming (Zeigarnik)
//
// Bounty triggers apply to funded bounties only. The bundled seed board is
// unfunded, and "NIM is waiting" would be a lie about it — see the guard in
// the bounty loop.
//
// Stale-station detection needs the contributor's touched cafés. In v1 those
// live client-side (the personal trail), so the client passes them as a query
// param; the server only decides *which* are stale from the canonical
// lastReadingAt timestamps. Bounty triggers are fully server-side.

import { getCafes } from "./cafes";
import { getBounties } from "./bounties";
import { slugify } from "./slug";
import { daysSince, stalenessLevel, type StalenessLevel } from "./staleness";

export type NotificationKind = "stale-station" | "bounty-expiring" | "bounty-claimable";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
}

const EXPIRY_SOON_DAYS = 3;

function daysUntil(dateStr: string): number {
  const then = new Date(`${dateStr}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.ceil((then - Date.now()) / (1000 * 60 * 60 * 24));
}

export interface NotificationInput {
  /**
   * Café names this contributor has touched (the personal trail is keyed by
   * name), so we can flag their stale ones. Matched against station names.
   */
  touchedNames?: string[];
  /** Scope bounty triggers to a city. */
  city?: string;
}

export async function getNotifications(
  input: NotificationInput,
): Promise<AppNotification[]> {
  const out: AppNotification[] = [];
  const { touchedNames = [], city } = input;

  // 1. Stale stations among the contributor's own.
  if (touchedNames.length > 0) {
    const all = await getCafes({ all: true });
    const wanted = new Set(touchedNames.map((n) => n.toLowerCase()));
    const touched = all.filter((c) => wanted.has(c.name.toLowerCase()));
    for (const cafe of touched) {
      const level: StalenessLevel = stalenessLevel(cafe.lastReadingAt);
      if (level === "stale") {
        const days = daysSince(cafe.lastReadingAt);
        out.push({
          id: `stale-${cafe.id}`,
          kind: "stale-station",
          title: `${cafe.name} is fading`,
          body: `No fresh reading for ${days}d. Run a test to bring its line back to full colour.`,
          href: `/cafes/${slugify(cafe.name)}?contribute=1`,
        });
      }
    }
  }

  // 2 + 3. Bounty triggers (expiry soon, claimable now).
  //
  // Unfunded seed-board examples are skipped entirely. Both triggers exist to
  // pull someone toward money — "your reward is waiting" / "expires in 2d" —
  // and a seed has no sponsor behind it, so both would be manufactured
  // urgency for a target nobody staked. Needs for readings on those stations
  // are surfaced honestly by the quest board instead.
  const bounties = await getBounties(city);
  for (const b of bounties) {
    if (b.synthetic) continue;
    const filled = b.progress >= b.target;
    // `claiming` is the state a completed bounty lands in — the progress
    // updater flips it there the moment the target is met. Gating on `open`
    // meant this trigger could never fire for exactly the bounties that had
    // reached their target, which is the only case it exists to catch.
    const terminal = b.status === "paid";

    if (filled && !terminal) {
      out.push({
        id: `claimable-${b.id}`,
        kind: "bounty-claimable",
        title: "Bounty ready to claim",
        body: `${b.goal} — ${b.rewardNim} NIM is waiting in ${b.area}.`,
        href: `${city ? `/${city}` : "/london"}#bounties`,
      });
      continue;
    }

    if (!terminal && b.expiresAt) {
      const left = daysUntil(b.expiresAt);
      if (left >= 0 && left <= EXPIRY_SOON_DAYS) {
        out.push({
          id: `expiring-${b.id}`,
          kind: "bounty-expiring",
          title: `Bounty expires ${left === 0 ? "today" : `in ${left}d`}`,
          body: `${b.goal} — ${b.progress}/${b.target} so far. One more reading could close it.`,
          href: `${city ? `/${city}` : "/london"}#bounties`,
        });
      }
    }
  }

  // Order: claimable first (most actionable), then expiring, then stale.
  const order: Record<NotificationKind, number> = {
    "bounty-claimable": 0,
    "bounty-expiring": 1,
    "stale-station": 2,
  };
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}
