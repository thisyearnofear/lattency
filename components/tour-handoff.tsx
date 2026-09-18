"use client";

// Handoff between the product reel and the cinematic line-ride — one job,
// one CTA, scroll cue. Keeps Act 02 from feeling like a second homepage.

import Link from "next/link";
import { cityPath, DEFAULT_CITY_ID } from "@/lib/cities";

export function TourHandoff() {
  return (
    <section
      className="mx-auto max-w-[1440px] px-4 sm:px-6 md:px-12 pt-12 sm:pt-16 md:pt-24 pb-6 sm:pb-8"
      aria-label="Ride the lines"
    >
      <div className="border border-ink/80 bg-cream shadow-[3px_4px_0_0_var(--color-ink)] sm:shadow-[4px_5px_0_0_var(--color-ink)] px-4 py-5 sm:px-8 sm:py-8 flex flex-wrap items-end justify-between gap-5 sm:gap-6">
        <div className="max-w-2xl">
          <p className="stamp">Act 02 · Ride the lines</p>
          <h2
            className="font-display font-black uppercase text-ink leading-[0.9] tracking-[-0.02em] mt-2"
            style={{ fontSize: "clamp(28px, 6vw, 56px)" }}
          >
            Twelve stations.
            <br />
            Three tiers. Scroll.
          </h2>
          <p className="font-serif italic text-ink-soft text-base sm:text-lg md:text-xl mt-3">
            Express rides video calls. Local keeps the tabs open. Suspended
            means find another stop. Scroll to ride each line end to end.
          </p>
        </div>
        <div className="flex flex-col items-start md:items-end gap-3 w-full sm:w-auto">
          <Link
            href={cityPath(DEFAULT_CITY_ID)}
            className="pressable w-full sm:w-auto justify-center bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-5 py-3.5 sm:py-3 inline-flex items-center gap-2 hover:bg-ink/90"
          >
            Skip to live map <span aria-hidden>→</span>
          </Link>
          <p className="stamp text-ink-faint scroll-cue hidden sm:block">
            ↓ scroll to board
          </p>
        </div>
      </div>
    </section>
  );
}
