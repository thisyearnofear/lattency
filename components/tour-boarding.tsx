"use client";

// Boarding stamp — MengTo-style preloader adapted to the transit identity.
// Skips on revisit (session), tap-to-skip, shorter on narrow screens.
// Reduced-motion visitors skip straight through.

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { BrandMark } from "./brand-mark";
import { useMatchMedia } from "@/hooks/use-match-media";

const SESSION_KEY = "lattency:tour-boarded";

export function TourBoarding({ onDone }: { onDone?: () => void }) {
  const [gone, setGone] = useState(false);
  const rootRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  const finishedRef = useRef(false);
  const narrow = useMatchMedia("(max-width: 640px)");

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* non-fatal */
    }
    setGone(true);
    doneRef.current?.();
  }

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) {
        finish();
        return;
      }
    } catch {
      /* show boarding */
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      finish();
      return;
    }

    const root = rootRef.current;
    const bar = barRef.current;
    if (!root || !bar) return;

    const fill = narrow ? 0.65 : 0.95;
    const lift = narrow ? 0.55 : 0.75;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: finish,
      });

      tl.fromTo(
        bar,
        { scaleX: 0, transformOrigin: "left center" },
        { scaleX: 1, duration: fill },
      ).to(
        root,
        { yPercent: -110, duration: lift, ease: "power4.inOut" },
        "+=0.12",
      );
    }, root);

    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  if (gone) return null;

  return (
    <button
      type="button"
      ref={rootRef}
      onClick={finish}
      className="fixed inset-0 z-[80] bg-ink text-cream flex flex-col items-center justify-center gap-5 sm:gap-6 cursor-pointer border-0 w-full"
      aria-label="Skip boarding and enter the tour"
    >
      <div className="flex items-center gap-2.5 sm:gap-3 px-6">
        <BrandMark size={32} decorative />
        <span className="font-display font-black uppercase text-3xl sm:text-4xl md:text-5xl tracking-[-0.02em] leading-none">
          Lattency
        </span>
      </div>
      <p className="font-mono text-[10px] sm:text-[11px] tracking-[0.28em] uppercase text-cream/55">
        All aboard · the product loop
      </p>
      <div className="w-40 sm:w-48 h-[3px] bg-cream/15 overflow-hidden">
        <div ref={barRef} className="h-full w-full bg-express origin-left" />
      </div>
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-cream/35 mt-2">
        Tap to skip
      </p>
    </button>
  );
}
