"use client";

// ContributionCelebration — the post-submission payoff. Replaces the old
// "Mapped!" + redirect dead-end with a moment of recognition: the
// contributor's running stats, a visual share card, their personal transit
// line, milestone titles, bounty connection, and clear next actions.
// Matches the newsprint/transit design language: stamp animations, hard
// offset shadows, mono uppercase labels, serif-italic editorial voice.

import { useMemo, useState, useEffect } from "react";
import type { Tier } from "@/lib/types";
import { useShareCard } from "./share-card";
import { YourLine, type TrailStation } from "./your-line";

interface CelebrationStats {
  cafesMapped: number;
  readingsLogged: number;
  citiesMapped: number;
}

interface BountyMatch {
  goal: string;
  area: string;
  rewardNim: number;
  progress: number;
  target: number;
}

function readCelebrationStats(): CelebrationStats {
  if (typeof window === "undefined") return { cafesMapped: 0, readingsLogged: 0, citiesMapped: 0 };
  try {
    const trail = JSON.parse(localStorage.getItem("lattency:trail:v1") ?? "{}") as Record<
      string,
      Array<{ name: string; lat: number; lng: number }>
    >;
    const cafesMapped = Object.values(trail).flat().length;
    const citiesMapped = Object.keys(trail).length;
    const readingsRaw = localStorage.getItem("lattency:readings-count");
    const readingsLogged = readingsRaw ? parseInt(readingsRaw, 10) : 0;
    return { cafesMapped, readingsLogged, citiesMapped };
  } catch {
    return { cafesMapped: 0, readingsLogged: 0, citiesMapped: 0 };
  }
}

function incrementReadingsCount() {
  if (typeof window === "undefined") return;
  const current = parseInt(localStorage.getItem("lattency:readings-count") ?? "0", 10);
  localStorage.setItem("lattency:readings-count", String(current + 1));
}

function readTrailStations(): TrailStation[] {
  if (typeof window === "undefined") return [];
  try {
    const trail = JSON.parse(localStorage.getItem("lattency:trail:v1") ?? "{}") as Record<
      string,
      Array<{ name: string; lat: number; lng: number }>
    >;
    const stations: TrailStation[] = [];
    for (const [city, list] of Object.entries(trail)) {
      for (const s of list) {
        stations.push({ name: s.name, tier: "express" as Tier, city });
      }
    }
    return stations;
  } catch {
    return [];
  }
}

// Transit-themed milestone titles — reinforce the metaphor.
function milestoneTitle(cafesMapped: number): { title: string; sub: string } {
  if (cafesMapped >= 10) return { title: "Network Architect", sub: "10+ stations on the map" };
  if (cafesMapped >= 5) return { title: "Line Builder", sub: "5 stations mapped" };
  if (cafesMapped >= 3) return { title: "Signal Surveyor", sub: "3 stations mapped" };
  if (cafesMapped >= 1) return { title: "Pioneer", sub: "first station on the network" };
  return { title: "Newcomer", sub: "ready to map" };
}

function StampBadge({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-ink/20 bg-cream-edge/40 p-4 text-center">
      <p className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-faint">
        {label}
      </p>
      <p className="font-display font-black text-4xl text-ink leading-none mt-2 tabular-nums">
        {value}
      </p>
      {sub && (
        <p className="font-mono text-[9px] tracking-[0.16em] uppercase text-ink-faint mt-1.5">
          {sub}
        </p>
      )}
    </div>
  );
}

export function ContributionCelebration({
  cafeName,
  neighbourhood,
  city,
  tier,
  downMbps,
  onMapAnother,
  onViewCafe,
}: {
  cafeName: string;
  neighbourhood: string;
  city: string;
  tier: string;
  downMbps: number;
  onMapAnother: () => void;
  onViewCafe: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [bounty, setBounty] = useState<BountyMatch | null>(null);
  const { shareCard } = useShareCard();

  // Increment the readings counter once on mount (before first paint),
  // then read all stats as the initial state — avoids a cascading render.
  const [stats] = useState<CelebrationStats>(() => {
    if (typeof window !== "undefined") {
      incrementReadingsCount();
    }
    return readCelebrationStats();
  });

  const [trailStations] = useState<TrailStation[]>(() => readTrailStations());

  const tierColour = useMemo(() => {
    const map: Record<string, string> = {
      express: "var(--color-express)",
      local: "var(--color-local)",
      suspended: "var(--color-suspended)",
    };
    return map[tier] ?? "var(--color-ink)";
  }, [tier]);

  const milestone = useMemo(() => milestoneTitle(stats.cafesMapped), [stats.cafesMapped]);

  const shareText = useMemo(() => {
    return `I just mapped ${cafeName} on @lattency — ${Math.round(downMbps)} Mbps on the ${tier} line. Where can you work?`;
  }, [cafeName, tier, downMbps]);

  // Fetch bounties for this city and try to match by neighbourhood.
  // This connects the celebration to the bounty system in the moment of
  // maximum engagement.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/bounties?city=${encodeURIComponent(city)}`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          const bounties: BountyMatch[] = data.bounties ?? data ?? [];
          // Match by neighbourhood substring in the bounty area.
          const match = bounties.find(
            (b: BountyMatch) =>
              b.area.toLowerCase().includes(neighbourhood.toLowerCase()) ||
              b.area.toLowerCase().includes(city.toLowerCase()),
          );
          if (!cancelled) setBounty(match ?? null);
        }
      } catch {
        // Bounties are a bonus, not critical — fail silently.
      }
    })();
    return () => { cancelled = true; };
  }, [city, neighbourhood]);

  async function handleShare() {
    setSharing(true);
    try {
      const tierEnum = tier as Tier;
      await shareCard(
        {
          cafeName,
          neighbourhood,
          tier: tierEnum,
          downMbps,
          contributorStats: {
            cafesMapped: stats.cafesMapped,
            citiesMapped: stats.citiesMapped,
          },
        },
        shareText,
      );
    } finally {
      setSharing(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const bountyPct = bounty
    ? Math.round((bounty.progress / bounty.target) * 100)
    : 0;

  return (
    <div className="py-6 px-2 space-y-6">
      {/* Animated stamp + milestone title */}
      <div className="text-center">
        <div className="celebration-stamp inline-block">
          <div
            className="inline-flex items-center justify-center w-20 h-20 mx-auto"
            style={{ background: tierColour }}
          >
            <span className="font-display font-black text-5xl text-cream">
              {tier[0]?.toUpperCase() ?? "X"}
            </span>
          </div>
        </div>
        <p className="font-display font-black text-3xl text-ink uppercase leading-none mt-4">
          You mapped {cafeName}
        </p>
        <p className="font-serif italic text-ink-soft text-base mt-2">
          {Math.round(downMbps)} Mbps · now riding the {tier} line.
          The map just got one station richer because of you.
        </p>
        {/* Milestone title */}
        <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 border border-ink/30 bg-cream-edge/40">
          <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-faint">Rank</span>
          <span className="font-display font-black text-sm uppercase text-ink">{milestone.title}</span>
          <span className="font-mono text-[9px] text-ink-faint">· {milestone.sub}</span>
        </div>
      </div>

      {/* Contributor stats — the engagement hook */}
      <div>
        <p className="stamp mb-3">Your contributions so far</p>
        <div className="grid grid-cols-3 gap-3">
          <StampBadge
            label="Cafés mapped"
            value={String(stats.cafesMapped)}
            sub="on the network"
          />
          <StampBadge
            label="Readings logged"
            value={String(stats.readingsLogged)}
            sub="speed tests run"
          />
          <StampBadge
            label="Cities"
            value={String(stats.citiesMapped)}
            sub="mapped by you"
          />
        </div>
      </div>

      {/* "Your line" visualization — the personal transit line */}
      {trailStations.length >= 2 && (
        <div className="border border-ink/15 bg-cream-edge/20 p-4">
          <YourLine stations={trailStations} title="Your transit line" />
        </div>
      )}

      {/* Bounty connection — closes the contribution-to-reward loop */}
      {bounty && (
        <div className="border border-express/40 bg-express/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-express text-cream font-display font-black text-lg w-8 h-10 flex items-center justify-center shrink-0">
              $
            </span>
            <div>
              <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-express">
                Bounty in your area
              </p>
              <p className="font-display font-black text-lg text-ink leading-tight mt-0.5">
                {bounty.goal}
              </p>
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-soft">
              {bounty.progress}/{bounty.target} · {bountyPct}%
            </p>
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint">
              {bounty.rewardNim} NIM reward
            </p>
          </div>
          <div className="h-[3px] bg-cream-deep w-full mt-2 relative">
            <div
              className="absolute inset-y-0 left-0 bg-express"
              style={{ width: `${Math.min(bountyPct, 100)}%` }}
            />
          </div>
          <p className="font-serif italic text-[13px] text-ink-soft mt-2">
            Your reading just pushed this bounty to {bountyPct}%.
            {bounty.progress + 1 >= bounty.target
              ? " One more to unlock the reward!"
              : ` ${bounty.target - bounty.progress - 1} more to unlock.`}
          </p>
        </div>
      )}

      {/* Share button — generates a visual share card */}
      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        className="w-full py-3 bg-ink text-cream font-mono text-xs tracking-[0.22em] uppercase hover:bg-ink/90 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {sharing ? (
          <>
            <span aria-hidden>◐</span> Generating card…
          </>
        ) : copied ? (
          <>
            <span aria-hidden>✓</span> Shared!
          </>
        ) : (
          <>
            <span aria-hidden>↗</span> Share your station
          </>
        )}
      </button>

      {/* CTAs — keep the momentum going */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onMapAnother}
          className="flex-1 py-3 border border-ink/40 font-mono text-xs tracking-[0.22em] uppercase text-ink-soft hover:border-ink hover:text-ink transition-colors"
        >
          + Map another
        </button>
        <button
          type="button"
          onClick={onViewCafe}
          className="flex-1 py-3 bg-ink text-cream font-mono text-xs tracking-[0.22em] uppercase hover:bg-ink/90 transition-colors"
        >
          View station →
        </button>
      </div>
    </div>
  );
}
