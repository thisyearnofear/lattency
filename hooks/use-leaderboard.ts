"use client";

// useLeaderboard — client fetch for the per-city ranking. Polls once on mount
// and whenever the city or requesting id changes. Returns an empty board while
// loading (or when Base44/mock mode has no attribution to rank).

import { useEffect, useState } from "react";
import type { LeaderboardEntry } from "@/lib/leaderboard";

interface LeaderboardResponse {
  city: string;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

export function useLeaderboard(city: string | undefined, meId: string) {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  // Only "loading" when there's actually a city to fetch for. Initializing
  // from `city` (rather than setting it synchronously in the effect) avoids a
  // cascading render when the caller passes no city.
  const [loading, setLoading] = useState(() => Boolean(city));

  useEffect(() => {
    if (!city) return;
    let cancelled = false;
    const params = new URLSearchParams({ city });
    if (meId) params.set("me", meId);

    void (async () => {
      try {
        const res = await fetch(`/api/leaderboard?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("leaderboard fetch failed");
        const json = (await res.json()) as LeaderboardResponse;
        if (!cancelled) setData(json);
      } catch {
        // Non-fatal — the board simply stays empty.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [city, meId]);

  return { entries: data?.entries ?? [], me: data?.me ?? null, loading };
}
