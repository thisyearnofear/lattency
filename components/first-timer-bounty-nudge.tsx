"use client";

// FirstTimerBountyNudge — endowed progress for brand-new visitors. When the
// browser has contributed nothing yet (empty personal trail), this surfaces the
// open bounty closest to completion in the current city, framed as a gap the
// visitor can personally close: "2/3 done — one more reading finishes it."
//
// This is the goal-gradient + near-miss nudge placed *before* the first
// contribution (the celebration screen already does the post-contribution
// version). It only appears for genuine first-timers, so it never pesters
// returning contributors.

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Bounty } from "@/lib/bounties";
import { GrowBar } from "./grow-bar";

const TRAIL_KEY = "lattency:trail:v1";

function hasContributed(): boolean {
  if (typeof window === "undefined") return true; // assume returning on SSR
  try {
    const trail = JSON.parse(localStorage.getItem(TRAIL_KEY) ?? "{}") as Record<
      string,
      unknown[]
    >;
    return Object.values(trail).some((list) => Array.isArray(list) && list.length > 0);
  } catch {
    return true;
  }
}

export function FirstTimerBountyNudge({ city }: { city: string }) {
  const [bounty, setBounty] = useState<Bounty | null>(null);

  useEffect(() => {
    if (hasContributed()) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/bounties?city=${encodeURIComponent(city)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { bounties?: Bounty[] };
        const open = (data.bounties ?? []).filter((b) => b.status === "open");
        if (open.length === 0) return;
        // Nearest-to-completion = highest progress/target ratio (goal-gradient).
        const nearest = open.reduce((best, b) => {
          const ratio = b.progress / b.target;
          const bestRatio = best.progress / best.target;
          return ratio > bestRatio ? b : best;
        }, open[0]);
        if (!cancelled) setBounty(nearest);
      } catch {
        /* non-fatal — the nudge simply doesn't show */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [city]);

  if (!bounty) return null;

  const remaining = Math.max(0, bounty.target - bounty.progress);
  const pct = Math.round((bounty.progress / bounty.target) * 100);

  return (
    <div className="mt-4 border border-express/40 bg-express/5 p-3.5 max-w-sm">
      <p className="font-mono text-[9px] tracking-[0.22em] uppercase text-express">
        Bounty almost filled · {bounty.area}
      </p>
      <p className="font-display font-black uppercase text-ink text-[17px] leading-tight mt-1">
        {bounty.goal}
      </p>
      <div className="flex items-center gap-2 mt-2">
        <GrowBar
          pct={pct}
          className="h-[3px] bg-cream-deep flex-1"
          barClassName="bg-express"
        />
        <span className="font-mono text-[9px] tabular-nums text-ink-soft">
          {bounty.progress}/{bounty.target}
        </span>
      </div>
      <p className="font-serif italic text-[13px] text-ink-soft mt-2">
        {remaining === 1
          ? "One more reading closes it. Yours could be the one."
          : `${remaining} readings short. Map one to push it over.`}{" "}
        Reward: {bounty.rewardNim} NIM.
      </p>
      <Link
        href={`/${city}?contribute=1`}
        className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-express hover:text-ink transition-colors"
      >
        Close this bounty <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
