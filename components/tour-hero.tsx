"use client";

// Compact boarding hero for /tour — brand-first, one headline, one CTA group,
// then the reel. Mobile: tighter type, stacked full-width CTAs, shorter proof.

import { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { BrandMark } from "./brand-mark";
import { cityPath, DEFAULT_CITY_ID } from "@/lib/cities";

gsap.registerPlugin(useGSAP);

export function TourHero() {
  const rootRef = useRef<HTMLElement>(null);
  const mapHref = cityPath(DEFAULT_CITY_ID);
  const contributeHref = `${mapHref}?contribute=1`;

  useGSAP(
    () => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        gsap.set("[data-tour-anim]", { autoAlpha: 1, clearProps: "all" });
        return;
      }

      gsap.from("[data-tour-anim]", {
        y: 22,
        autoAlpha: 0,
        filter: "blur(5px)",
        duration: 0.85,
        ease: "power4.out",
        stagger: 0.06,
        delay: 1.05,
      });
    },
    { scope: rootRef },
  );

  return (
    <header ref={rootRef} className="relative pt-4 sm:pt-6 md:pt-10">
      <div className="flex items-center justify-between border-b border-ink/80 pb-2.5 sm:pb-3 gap-3">
        <span data-tour-anim className="stamp inline-flex items-center gap-2 min-w-0">
          <BrandMark size={18} decorative />
          <span className="truncate">The Tour · Edition 01</span>
        </span>
        <span data-tour-anim className="stamp shrink-0">
          Live in <span className="text-express">3 cities</span>
        </span>
      </div>

      <div className="grid grid-cols-12 gap-4 sm:gap-6 pt-5 sm:pt-7 pb-5 sm:pb-8 md:pb-10">
        <div className="col-span-12 lg:col-span-8">
          <p data-tour-anim className="stamp text-express">
            No demo mode · the real flow
          </p>
          <h1
            data-tour-anim
            className="font-display font-black uppercase text-ink leading-[0.86] tracking-[-0.02em] mt-1.5 sm:mt-2"
            style={{ fontSize: "clamp(44px, 12vw, 120px)" }}
          >
            Lattency
          </h1>
          <p
            data-tour-anim
            className="font-serif italic text-ink-soft text-lg sm:text-xl md:text-2xl mt-2.5 sm:mt-3 max-w-2xl"
          >
            <span className="sm:hidden">
              Sixty seconds — tap, test, land, earn NIM.
            </span>
            <span className="hidden sm:inline">
              Sixty seconds start to finish — tap a station, run a real speed
              test, watch your pin extend the line, earn NIM when a bounty closes.
            </span>
          </p>
        </div>

        <div
          data-tour-anim
          className="col-span-12 lg:col-span-4 lg:pl-8 lg:border-l lg:border-cream-deep flex flex-col justify-end gap-3 sm:gap-4"
        >
          <p className="font-mono text-[12px] sm:text-[13px] leading-relaxed text-ink-soft hidden sm:block">
            The reel below runs the product on a loop. When you&rsquo;re ready,
            open a live city and do it yourself.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3">
            <Link
              href={mapHref}
              className="pressable bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-5 py-3.5 sm:py-3 inline-flex items-center justify-center gap-2 hover:bg-ink/90 shadow-[3px_4px_0_0_var(--color-ink)]"
            >
              Open the map <span aria-hidden>→</span>
            </Link>
            <Link
              href={contributeHref}
              className="pressable border border-ink/80 bg-cream text-ink font-mono text-[11px] tracking-[0.22em] uppercase px-4 py-3.5 sm:py-3 inline-flex items-center justify-center gap-2 hover:bg-cream-edge"
            >
              <span aria-hidden>+</span> Map a café
            </Link>
          </div>
        </div>
      </div>

      <ul
        data-tour-anim
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory border-y border-ink/80 py-2.5 sm:py-3 mb-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible"
        aria-label="Proof points"
      >
        {[
          "Verified speed tests",
          "Objective facts — no stars",
          "Bounties paid in NIM",
        ].map((line) => (
          <li
            key={line}
            className="snap-start shrink-0 font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft inline-flex items-center gap-2 border border-ink/20 bg-cream-edge/30 px-2.5 py-1.5 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
          >
            <span className="w-1.5 h-1.5 bg-express shrink-0" aria-hidden />
            {line}
          </li>
        ))}
      </ul>
    </header>
  );
}
