"use client";

// Closing conversion strip — same primary action as the hero (open the map).

import Link from "next/link";
import { cityPath, DEFAULT_CITY_ID } from "@/lib/cities";

export function TourFinale() {
  const mapHref = cityPath(DEFAULT_CITY_ID);
  return (
    <section
      className="mt-14 sm:mt-20 border border-ink/80 bg-ink text-cream shadow-[4px_5px_0_0_rgba(26,22,18,0.35)] sm:shadow-[6px_8px_0_0_rgba(26,22,18,0.35)] px-4 py-7 sm:px-10 sm:py-10"
      aria-label="Open a live city"
    >
      <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-cream/55">
        Your stop · now boarding
      </p>
      <h2
        className="font-display font-black uppercase leading-[0.9] tracking-[-0.02em] mt-2"
        style={{ fontSize: "clamp(32px, 8vw, 72px)" }}
      >
        Open a city.
        <br />
        Run the loop yourself.
      </h2>
      <p className="font-serif italic text-cream/70 text-base sm:text-lg md:text-xl mt-4 max-w-2xl">
        London, Nairobi, and San Francisco are live. Tap a station, log a
        verified reading, and push a bounty forward — paid in NIM.
      </p>
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3 mt-6 sm:mt-7">
        <Link
          href={mapHref}
          className="pressable bg-cream text-ink font-mono text-[11px] tracking-[0.22em] uppercase px-5 py-3.5 sm:py-3 inline-flex items-center justify-center gap-2 hover:bg-cream-edge shadow-[3px_4px_0_0_var(--color-express)]"
        >
          Open London map <span aria-hidden>→</span>
        </Link>
        <Link
          href={`${mapHref}?contribute=1`}
          className="pressable border border-cream/40 text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-4 py-3.5 sm:py-3 inline-flex items-center justify-center gap-2 hover:bg-cream/10"
        >
          <span aria-hidden>+</span> Map a café
        </Link>
        <div className="flex items-center justify-center sm:justify-start gap-4 pt-1 sm:pt-0 sm:pl-2">
          <Link
            href="/nairobi"
            className="font-mono text-[11px] tracking-[0.18em] uppercase text-cream/55 hover:text-cream transition-colors underline underline-offset-4"
          >
            Nairobi
          </Link>
          <Link
            href="/sf"
            className="font-mono text-[11px] tracking-[0.18em] uppercase text-cream/55 hover:text-cream transition-colors underline underline-offset-4"
          >
            San Francisco
          </Link>
        </div>
      </div>
    </section>
  );
}
