"use client";

// useBountyMatch — finds the open bounty this contribution is pushing
// forward, so pay-off screens can connect the reading to the reward in the
// moment of maximum engagement. Matches by neighbourhood first, then city.
// Extracted from the celebration so the measurement success state can show
// the same connection (and the "BOUNTY FILLED" moment) without duplicating
// the fetch.

import { useEffect, useState } from "react";

export interface BountyMatch {
  goal: string;
  area: string;
  rewardNim: number;
  progress: number;
  target: number;
  status: string;
}

export function useBountyMatch(
  city: string | undefined,
  neighbourhood: string | undefined,
  enabled = true,
) {
  const [bounty, setBounty] = useState<BountyMatch | null>(null);

  useEffect(() => {
    if (!enabled || !city) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/bounties?city=${encodeURIComponent(city)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { bounties?: BountyMatch[] };
        const bounties = data.bounties ?? [];
        const match = bounties.find(
          (b) =>
            (neighbourhood && b.area.toLowerCase().includes(neighbourhood.toLowerCase())) ||
            b.area.toLowerCase().includes(city.toLowerCase()),
        );
        if (!cancelled) setBounty(match ?? null);
      } catch {
        // Bounties are a bonus, not critical — fail silently.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [city, neighbourhood, enabled]);

  return bounty;
}
