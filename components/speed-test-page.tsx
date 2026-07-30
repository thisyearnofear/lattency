"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SpeedTestResult } from "@/lib/speedtest";
import { SpeedTestPanel } from "./speed-test-panel";
import { useShareCard } from "./share-card";
import { tierForDown } from "@/lib/map-data";
import { DEFAULT_CITY_ID, cityDisplayName } from "@/lib/cities";
import { getLastVisitedCity } from "./city-visit-tracker";

const PREFILL_KEY = "lattency:speedtest:prefill";

export function SpeedTestPage() {
  const router = useRouter();
  const { shareCard } = useShareCard();

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
      <p className="stamp">Network tools</p>
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
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
          Why this matters
        </p>
        <p className="font-serif italic text-ink-soft text-base mt-2 max-w-xl">
          A single verified reading is the seed of a new station. Run the test
          where you&rsquo;re sitting, add a café, and your city goes live on the
          map.
        </p>
      </div>
    </main>
  );
}
