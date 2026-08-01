// Leaderboards — per-city contributor rankings. Built server-side by scanning
// the Measurement entities for `contributor_user_id` tags and grouping by
// contributor + city (resolved through each measurement's café). Falls back to
// an empty board when Base44 is unconfigured (the mock snapshot carries no
// contributor attribution by design — it's pre-seeded data).
//
// Ranks are ordered by stations touched in the city, then readings. The
// requesting contributor (if provided) is always returned with their own
// totals even when they don't crack the top N, so /me can show "you're #12".

import { getBase44, base44Configured } from "./base44";
import { contributorHandle } from "./contributor";
import { log } from "./log";

export interface LeaderboardEntry {
  contributorId: string;
  handle: string;
  displayName: string | null;
  readings: number;
  stations: number;
  rank: number;
}

interface LeaderboardRow {
  contributor_user_id: string;
  cafe_id: string;
  city: string;
}

// Page size when scanning the measurement log. Large enough to rank a city,
// small enough not to melt a cold serverless function.
const SCAN_LIMIT = 500;
const TOP_N = 10;

/**
 * Compute the leaderboard for a city.
 * - `city`: the city slug to rank.
 * - `meId`: optional requesting contributor id — guaranteed to appear in the
 *   result (with its computed rank) so a profile page can show standing.
 */
export async function getLeaderboard(
  city: string,
  meId?: string,
): Promise<{ entries: LeaderboardEntry[]; me: LeaderboardEntry | null }> {
  if (!base44Configured) return { entries: [], me: null };

  try {
    const base44 = getBase44();

    // 1. Pull recent measurements tagged with a contributor id.
    const rows = (await base44.entities.Measurement.filter(
      {},
      "-measured_at",
      SCAN_LIMIT,
      0,
    )) as unknown as Array<{ contributor_user_id?: string; cafe_id?: string }>;

    const withContributor = rows.filter(
      (r): r is LeaderboardRow =>
        Boolean(r.contributor_user_id) && Boolean(r.cafe_id),
    );
    if (withContributor.length === 0) return { entries: [], me: null };

    // 2. Resolve cafe_id → city so we can scope the board to one city.
    const cafeIds = Array.from(new Set(withContributor.map((r) => r.cafe_id)));
    const cityByCafe = new Map<string, string>();
    for (const id of cafeIds) {
      try {
        const cafe = (await base44.entities.Cafe.get(id)) as { city?: string } | null;
        if (cafe?.city) cityByCafe.set(id, cafe.city);
      } catch {
        // A single failed lookup just drops that reading from the board.
      }
    }

    // 3. Group by contributor within the target city.
    const agg = new Map<string, { readings: number; stations: Set<string> }>();
    for (const row of withContributor) {
      if (cityByCafe.get(row.cafe_id) !== city) continue;
      const key = row.contributor_user_id;
      const bucket = agg.get(key) ?? { readings: 0, stations: new Set<string>() };
      bucket.readings += 1;
      bucket.stations.add(row.cafe_id);
      agg.set(key, bucket);
    }

    const ranked = Array.from(agg.entries())
      .map(([contributorId, { readings, stations }]) => ({
        contributorId,
        readings,
        stations: stations.size,
      }))
      .sort((a, b) => b.stations - a.stations || b.readings - a.readings);

    const toEntry = (
      e: { contributorId: string; readings: number; stations: number },
      rank: number,
    ): LeaderboardEntry => ({
      contributorId: e.contributorId,
      handle: contributorHandle(e.contributorId),
      displayName: null, // display names are client-local in v1
      readings: e.readings,
      stations: e.stations,
      rank,
    });

    const entries = ranked.slice(0, TOP_N).map((e, i) => toEntry(e, i + 1));

    let me: LeaderboardEntry | null = null;
    if (meId) {
      const idx = ranked.findIndex((e) => e.contributorId === meId);
      if (idx !== -1) me = toEntry(ranked[idx], idx + 1);
    }

    return { entries, me };
  } catch (err) {
    log.warn("getLeaderboard: Base44 read failed", {
      scope: "leaderboard",
      city,
      reason: err instanceof Error ? err.message : String(err),
    });
    return { entries: [], me: null };
  }
}
