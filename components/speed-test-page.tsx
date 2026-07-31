"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { SpeedTestResult } from "@/lib/speedtest";
import { SpeedTestPanel } from "./speed-test-panel";
import { useShareCard } from "./share-card";
import {
  TIER_COLOUR,
  TIER_PATH,
  VIEW_H,
  VIEW_W,
  pointAlongTier,
  tierForDown,
  type Tier,
} from "@/lib/map-data";
import { DEFAULT_CITY_ID, cityDisplayName } from "@/lib/cities";
import { getLastVisitedCity } from "./city-visit-tracker";

const PREFILL_KEY = "lattency:speedtest:prefill";

// Faint schematic map-plate behind the page — the same three tier Beziers
// the city maps draw, inked like a printer's ghost. When a result lands,
// the matching line takes its tier colour and a "YOU" station arrives on it.
function TierLinesBackdrop({ tier }: { tier: Tier | null }) {
  // t=0.14 lands the station in the left margin, clear of the centered
  // 720px content column, on desktop widths where the backdrop is visible.
  const you = tier ? pointAlongTier(tier, 0.14) : null;
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
      >
        {(Object.keys(TIER_PATH) as Tier[]).map((t) => (
          <path
            key={t}
            d={TIER_PATH[t]}
            fill="none"
            stroke={tier === t ? TIER_COLOUR[t] : "var(--color-ink)"}
            strokeOpacity={tier === t ? 0.3 : 0.06}
            strokeWidth={tier === t ? 5 : 4}
            strokeLinecap="round"
            strokeDasharray={t === "suspended" ? "14 10" : undefined}
            style={{ transition: "stroke 600ms ease, stroke-opacity 600ms ease" }}
          />
        ))}
        {you && tier && (
          <g key={tier}>
            <circle
              className="arrival-ring"
              cx={you.x}
              cy={you.y}
              r={12}
              fill="none"
              stroke={TIER_COLOUR[tier]}
              strokeWidth={3}
            />
            <circle
              cx={you.x}
              cy={you.y}
              r={9}
              fill="var(--color-cream)"
              stroke={TIER_COLOUR[tier]}
              strokeWidth={4}
            />
            <text
              x={you.x}
              y={you.y - 22}
              textAnchor="middle"
              className="font-mono"
              fontSize={13}
              fontWeight={700}
              letterSpacing="0.2em"
              fill={TIER_COLOUR[tier]}
            >
              YOU
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function SpeedTestPage() {
  const router = useRouter();
  const { shareCard } = useShareCard();
  const [resultTier, setResultTier] = useState<Tier | null>(null);

  // Resolve the best city to send the user to. Read lazily from
  // localStorage so we don't render a different value on the server
  // during SSR (which would cause a hydration mismatch).
  const resolveCity = useCallback(() => {
    if (typeof window === "undefined") return DEFAULT_CITY_ID;
    return getLastVisitedCity() ?? DEFAULT_CITY_ID;
  }, []);

  const handleContribute = useCallback(
    (result: SpeedTestResult) => {
      try {
        sessionStorage.setItem(PREFILL_KEY, JSON.stringify(result));
      } catch {
        // Non-fatal: the user can still run the test inside the contribution flow.
      }
      router.push(`/${resolveCity()}?contribute=1`);
    },
    [router, resolveCity],
  );

  const handleResult = useCallback(
    async (result: SpeedTestResult) => {
      const tier = tierForDown(result.downMbps);
      setResultTier(tier);
      const displayCity = cityDisplayName(resolveCity());
      const shareText = `I just tested my wifi on Lattency — ${Math.round(result.downMbps)} Mbps down on the ${tier} line.`;
      const origin = typeof window !== "undefined" ? window.location.origin : "https://lattency.app";

      // Best-effort share; on desktop without Web Share API this falls back
      // to downloading the card.
      await shareCard(
        {
          cafeName: "MY WIFI",
          neighbourhood: displayCity,
          tier,
          downMbps: result.downMbps,
          contributorStats: { cafesMapped: 0, citiesMapped: 0 },
        },
        `${shareText} ${origin}`,
      );
    },
    [shareCard, resolveCity],
  );

  return (
    <main className="mx-auto max-w-[720px] px-6 md:px-12 pt-10 pb-24">
      <TierLinesBackdrop tier={resultTier} />
      <p className="stamp">Platform inspection · any city</p>
      <h1
        className="font-display font-black uppercase text-ink leading-[0.92] tracking-[-0.02em] mt-3"
        style={{ fontSize: "clamp(40px, 7vw, 80px)" }}
      >
        Test my wifi.
      </h1>
      <p className="font-serif italic text-ink-soft text-xl mt-4 max-w-2xl">
        See how your connection ranks on the Lattency network — Express,
        Local, or Suspended. Works anywhere, even if there are no cafés mapped
        near you yet.
      </p>

      <div className="mt-8">
        <SpeedTestPanel onResult={handleResult} onContribute={handleContribute} />
      </div>

      <div className="mt-12 pt-8 border-t border-ink/15">
        <p className="font-serif italic text-ink-soft text-base max-w-xl">
          Run the test where you&rsquo;re sitting, add a café, and your city goes live on the map.
        </p>
      </div>
    </main>
  );
}
