"use client";

// ContributionCelebration — the post-submission payoff. Replaces the old
// "Mapped!" + redirect dead-end with a moment of recognition: the
// contributor's running stats, a visual share card, their personal transit
// line, milestone titles, bounty connection, and clear next actions.
// Matches the newsprint/transit design language: stamp animations, hard
// offset shadows, mono uppercase labels, serif-italic editorial voice.

import { useMemo, useState } from "react";
import type { Tier } from "@/lib/types";
import { slugify } from "@/lib/slug";
import { readContributorId } from "@/lib/contributor";
import { milestoneFor } from "@/lib/milestones";
import { useBountyMatch } from "@/hooks/use-bounty-match";
import { haptic } from "@/lib/haptics";
import { useShareCard } from "./share-card";
import { YourLine, type TrailStation } from "./your-line";
import { GrowBar } from "./grow-bar";

interface CelebrationStats {
  cafesMapped: number;
  readingsLogged: number;
  citiesMapped: number;
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

// Milestone titles live in lib/milestones.ts (shared with /me) so a rank
// means the same thing on the celebration, the profile, and the leaderboard.

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
  const { shareCard } = useShareCard();

  // Increment the readings counter once on mount (before first paint),
  // then read all stats as the initial state — avoids a cascading render.
  // The pay-off moment lands with a physical tap on devices that vibrate.
  const [stats] = useState<CelebrationStats>(() => {
    if (typeof window !== "undefined") {
      incrementReadingsCount();
      haptic(14);
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

  const milestone = useMemo(() => milestoneFor(stats.cafesMapped), [stats.cafesMapped]);
  // This contribution just crossed a rank threshold — celebrate it loudly.
  const justRankedUp = useMemo(
    () => stats.cafesMapped > 0 && milestone.at === stats.cafesMapped && milestone.at > 0,
    [stats.cafesMapped, milestone],
  );

  const shareText = useMemo(() => {
    return `I just mapped ${cafeName} on @lattency — ${Math.round(downMbps)} Mbps on the ${tier} line. Where can you work?`;
  }, [cafeName, tier, downMbps]);

  // Deep link back to this station, carrying referral attribution so the
  // recipient's first contribution credits this contributor (?via=).
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const origin = window.location.origin;
    const slug = slugify(cafeName);
    const contributorId = readContributorId();
    const via = contributorId ? `?via=${encodeURIComponent(contributorId)}` : "";
    return `${origin}/cafes/${slug}${via}`;
  }, [cafeName]);

  // Fetch the bounty this contribution is pushing forward, in the moment of
  // maximum engagement. Shared hook with the measurement success state.
  const bounty = useBountyMatch(city, neighbourhood);

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
          shareUrl,
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
        {/* Milestone title — a fresh rank gets the loud stamp treatment. */}
        {justRankedUp ? (
          <div className="celebration-stamp inline-flex items-center gap-2 mt-3 px-3 py-1.5 border-2 border-express bg-express text-cream shadow-[3px_4px_0_0_var(--color-ink)]">
            <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-cream/80">New rank</span>
            <span className="font-display font-black text-sm uppercase">{milestone.title}</span>
            <span className="font-mono text-[9px] text-cream/80">· {milestone.sub}</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 border border-ink/30 bg-cream-edge/40">
            <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-faint">Rank</span>
            <span className="font-display font-black text-sm uppercase text-ink">{milestone.title}</span>
            <span className="font-mono text-[9px] text-ink-faint">· {milestone.sub}</span>
          </div>
        )}
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
          <GrowBar
            pct={bountyPct}
            className="h-[3px] bg-cream-deep w-full mt-2"
            barClassName="bg-express"
          />
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
