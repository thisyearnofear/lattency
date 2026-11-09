// Per-venue "needs" — the data-adaptive half of the ask layer
// (docs/adaptive-ux-principles.md). Pure and client-safe: derived only from
// fields already on CafeStation, no server-only imports. Ask cards consume
// this; dismissal persistence lives in lib/ask-dismissals.ts.

import type { CafeStation } from "./types";
import { haversineKm, isValidCoordinates } from "./geo";

// Ordered by scarcity weight — the gap the map feels most goes first: a
// faceless station outranks a stale one, staleness outranks a missing
// upload leg, fact enrichment and the 3D record come last.
export type VenueNeed = "photo" | "freshness" | "upload" | "facts" | "scan";

export const VENUE_NEED_ORDER: readonly VenueNeed[] = [
  "photo",
  "freshness",
  "upload",
  "facts",
  "scan",
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** A reading goes stale past 14 days — the same threshold the map's fade
 *  and "needs a fresh test" banner use (lib/staleness.ts). */
export const VENUE_STALE_AFTER_MS = 14 * DAY_MS;

// The fact fields a contributor can confirm. powerOutlets === false counts
// as an answer ("confirmed: no outlets"), so presence means !== undefined,
// not truthiness.
const FACT_KEYS = [
  "priceTier",
  "powerOutlets",
  "seating",
  "noiseLevel",
  "wifiNetwork",
] as const;

/** Whole days since the last reading. Null when the timestamp is missing
 *  or unparseable — callers treat that as "freshness unknown", which is
 *  itself a need. */
export function staleDays(
  lastReadingAt: string | undefined,
  now: number,
): number | null {
  if (!lastReadingAt) return null;
  const then = new Date(lastReadingAt).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now - then) / DAY_MS);
}

function factsSet(cafe: CafeStation): number {
  const meta = cafe.metadata;
  if (!meta) return 0;
  return FACT_KEYS.filter((k) => meta[k] !== undefined).length;
}

/** Derives the station's open gaps in scarcity order. `hasScan` comes from
 *  the venue-scans endpoint, not the station — `true` suppresses the scan
 *  need; `undefined` means the caller hasn't checked, so the need is still
 *  reported and it's the caller's job to confirm before showing it. */
export function venueNeeds(
  cafe: CafeStation,
  now: number = Date.now(),
  hasScan?: boolean,
): VenueNeed[] {
  const open = new Set<VenueNeed>();

  // Rung 3 — no face on the card.
  if (!cafe.photoUrl && !cafe.latestPhotoUrl) open.add("photo");

  // Rung 5 — nothing on file, or the freshest reading is past the fade.
  const lastAt = cafe.lastReadingAt
    ? new Date(cafe.lastReadingAt).getTime()
    : NaN;
  if (Number.isNaN(lastAt) || now - lastAt > VENUE_STALE_AFTER_MS) {
    open.add("freshness");
  }

  // Rung 5 — readings exist but none carried an upload leg.
  if (cafe.measurementCount > 0 && !cafe.medianUpMbps) open.add("upload");

  // Rung 2 — fewer than two confirmed workspace facts.
  if (factsSet(cafe) < 2) open.add("facts");

  // Rung 7 — no published spatial record.
  if (hasScan !== true) open.add("scan");

  return VENUE_NEED_ORDER.filter((n) => open.has(n));
}

export interface VenueAsk {
  /** Card stamp — the gap named in a few words. */
  label: string;
  /** Honest time cost, straight off the contribution ladder. */
  timeCost: string;
  /** What's missing, in the editorial voice. Never "verified". */
  gap: string;
  /** The visible enrichment the action buys. */
  payoff: string;
  /** Contribution-ladder rung this ask belongs to. */
  rung: number;
}

/** Card copy per need. `staleDays` sharpens the freshness gap when the
 *  caller can compute it — "Stale 21 days" beats "stale". */
export function askFor(need: VenueNeed, ctx?: { staleDays?: number }): VenueAsk {
  switch (need) {
    case "photo":
      return {
        label: "No photo on file",
        timeCost: "~20s",
        gap: "This station has no photo",
        payoff: "yours becomes its face",
        rung: 3,
      };
    case "freshness":
      return {
        label: "Stale readings",
        timeCost: "~60s",
        gap:
          ctx?.staleDays !== undefined
            ? `Stale ${ctx.staleDays} days`
            : "No recent reading on file",
        payoff: "one retest refreshes it",
        rung: 5,
      };
    case "upload":
      return {
        label: "No upload reading",
        timeCost: "~60s",
        gap: "No upload reading yet",
        payoff: "yours would be the first",
        rung: 5,
      };
    case "facts":
      return {
        label: "Details unconfirmed",
        timeCost: "~10s",
        gap: "Nobody's confirmed the details — outlets? seating?",
        payoff: "one fact fills it in",
        rung: 2,
      };
    case "scan":
      return {
        label: "No spatial record",
        timeCost: "~3min",
        gap: "No spatial record",
        payoff: "a capture run would put it on the map in 3D",
        rung: 7,
      };
  }
}

/** The next un-answered ask for this venue — one card, never a stack.
 *  `answeredNeeds` is whatever the ask layer considers settled (dismissed
 *  or contributed). Returns null when the station has no open asks. */
export function nextAsk(
  cafe: CafeStation,
  answeredNeeds?: Set<VenueNeed>,
  hasScan?: boolean,
  now: number = Date.now(),
): { need: VenueNeed; ask: VenueAsk } | null {
  const need = venueNeeds(cafe, now, hasScan).find(
    (n) => !answeredNeeds?.has(n),
  );
  if (!need) return null;
  const days = staleDays(cafe.lastReadingAt, now);
  return {
    need,
    ask: askFor(
      need,
      need === "freshness" && days !== null && days > 0
        ? { staleDays: days }
        : undefined,
    ),
  };
}

// ── Session-context ranking ─────────────────────────────────────────────
// The "what the map needs from you right now" primitive (step 4 of the
// implementation order). Given a granted location, rank nearby stations'
// open asks by distance first — the closest gap is the most doable — then
// scarcity weight, so an equidistant faceless station outranks a stale one.

/** How far the session ask surface reaches. ~1.5km is a short walk —
 *  the asks it surfaces are things you could literally do next. */
export const NEARBY_NEED_RADIUS_KM = 1.5;

/** Max asks the session surface carries. The venue drawer asks one thing;
 *  the strip asks a few — never a stack. */
export const NEARBY_NEED_CAP = 5;

export interface NearbyNeed {
  cafe: CafeStation;
  need: VenueNeed;
  ask: VenueAsk;
  distanceKm: number;
}

/** Stations within NEARBY_NEED_RADIUS_KM that carry an open ask, nearest
 *  first (ties break toward the scarcer need). `answeredNeeds` maps
 *  cafeId → needs already settled this session (dismissed or contributed)
 *  so a dismissed top-need falls through to the venue's next gap rather
 *  than hiding the venue outright. Scan asks never surface here — the
 *  session strip can't confirm scan state cheaply, so it treats scan as
 *  satisfied and leaves rung 7 to the venue surfaces that verify first.
 *  An unusable location yields an empty ranking, never a prompt. */
export function rankNeedsByProximity(
  stations: CafeStation[],
  userLat: number,
  userLng: number,
  now: number = Date.now(),
  answeredNeeds?: Map<string, Set<VenueNeed>>,
): NearbyNeed[] {
  if (!isValidCoordinates(userLat, userLng)) return [];
  const user = { lat: userLat, lng: userLng };
  const rows: NearbyNeed[] = [];
  for (const cafe of stations) {
    const distanceKm = haversineKm(user, cafe);
    if (distanceKm > NEARBY_NEED_RADIUS_KM) continue;
    const next = nextAsk(cafe, answeredNeeds?.get(cafe.id), true, now);
    if (!next) continue;
    rows.push({ cafe, need: next.need, ask: next.ask, distanceKm });
  }
  return rows
    .sort(
      (a, b) =>
        a.distanceKm - b.distanceKm ||
        VENUE_NEED_ORDER.indexOf(a.need) - VENUE_NEED_ORDER.indexOf(b.need),
    )
    .slice(0, NEARBY_NEED_CAP);
}
