"use client";

// NearbyAskStrip — the session-context half of the ask layer
// (docs/adaptive-ux-principles.md, step 4). Once the user has shared their
// location, this slim strip surfaces the closest open venue needs —
// "what the map needs from you right now" — ranked by distance, then
// scarcity. It never asks for location itself: it renders only when a
// granted position arrives by prop, so a denied or never-asked session
// simply sees nothing. Chips reuse the station-marker mechanism — tapping
// one opens the venue's drawer, where the matching ask card is waiting.

import { useEffect, useMemo, useState } from "react";
import type { CafeStation, Tier } from "@/lib/types";
import {
  rankNeedsByProximity,
  VENUE_NEED_ORDER,
  type VenueNeed,
} from "@/lib/venue-needs";
import { isAskDismissed } from "@/lib/ask-dismissals";

const TIER_BG: Record<Tier, string> = {
  express: "bg-express",
  local: "bg-local",
  suspended: "bg-suspended",
};
const TIER_BADGE: Record<Tier, string> = {
  express: "X",
  local: "L",
  suspended: "S",
};

// The need as a verb phrase — what a tap through would let you do.
const NEED_VERB: Record<VenueNeed, string> = {
  photo: "needs a photo",
  freshness: "needs a retest",
  upload: "needs an upload leg",
  facts: "needs a detail",
  scan: "needs a scan",
};

// Fewer chips than the lib cap — the strip stays a glance, not a list.
const MAX_CHIPS = 3;

export function NearbyAskStrip({
  cafes,
  user,
  onSelect,
}: {
  cafes: CafeStation[];
  /** Granted geolocation — null until the user taps "Find me". */
  user: { lat: number; lng: number } | null;
  onSelect: (cafe: CafeStation) => void;
}) {
  // Dismissals live in localStorage and "now" is impure — both are read
  // post-mount so SSR and the first client paint agree. The strip only
  // ever appears, never tears out.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);

  const rows = useMemo(() => {
    if (!user || now === null) return [];
    // Per-venue dismissed sets, so a dismissed top-need falls through to
    // that station's next open ask instead of hiding it outright.
    const dismissed = new Map<string, Set<VenueNeed>>();
    for (const cafe of cafes) {
      const set = new Set<VenueNeed>(
        VENUE_NEED_ORDER.filter((n) => isAskDismissed(cafe.id, n, now)),
      );
      if (set.size > 0) dismissed.set(cafe.id, set);
    }
    return rankNeedsByProximity(
      cafes,
      user.lat,
      user.lng,
      now,
      dismissed,
    ).slice(0, MAX_CHIPS);
  }, [cafes, user, now]);

  if (!user || rows.length === 0) return null;

  return (
    <div className="msg-in mt-3 border border-ink/60 bg-cream-edge/60 px-3 py-2.5 shadow-[3px_4px_0_0_var(--color-ink)]">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <p className="stamp shrink-0">The line needs</p>
        {rows.map(({ cafe, need, ask, distanceKm }) => (
          <button
            key={`${cafe.id}:${need}`}
            type="button"
            onClick={() => onSelect(cafe)}
            className="pressable inline-flex min-w-0 items-center gap-1.5 border border-ink/25 bg-cream pl-1 pr-2 py-1 font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft hover:border-ink hover:text-ink transition-colors"
          >
            <span
              aria-hidden
              className={`${TIER_BG[cafe.tier]} w-4 h-4 shrink-0 inline-flex items-center justify-center text-cream font-display font-black text-[10px]`}
            >
              {TIER_BADGE[cafe.tier]}
            </span>
            <span className="max-w-[130px] truncate text-ink">
              {cafe.name}
            </span>
            <span className="text-ink-faint tabular-nums">
              ·{" "}
              {distanceKm < 1
                ? `${Math.round(distanceKm * 1000)}m`
                : `${distanceKm.toFixed(1)}km`}
            </span>
            <span className="text-ink-faint">· {ask.timeCost}</span>
            <span>· {NEED_VERB[need]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
