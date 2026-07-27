"use client";

// First-visit coach — a small dismissible ticket pinned to the map corner,
// never a blocking modal. Judges and curious users should be able to click
// straight through without being told what to do; the ticket is a nudge,
// not a gate. Shows once per browser. Newsprint ticket aesthetic.

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "lattency:onboarded:v1";

export function OnboardingOverlay({ cityName }: { cityName: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      /* storage unavailable — show the coach anyway */
    }
    // Let the map settle before sliding the ticket in.
    const t = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* non-fatal */
    }
  }

  if (!visible) return null;

  return (
    <div
      className="toast-in fixed bottom-28 right-4 sm:right-6 z-[600] w-[290px] max-w-[86vw] pointer-events-auto"
      role="region"
      aria-label="Getting started with Lattency"
    >
      <div className="relative bg-cream border border-ink shadow-[4px_5px_0_0_var(--color-ink)]">
        {/* Perforated top edge — the ticket idiom. */}
        <div
          aria-hidden
          className="absolute -top-1 inset-x-2 flex justify-between"
        >
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} className="w-1 h-2 bg-cream" />
          ))}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss getting started tip"
          className="absolute top-1.5 right-1.5 w-6 h-6 grid place-items-center text-ink-faint hover:text-ink hover:bg-cream-edge transition-colors font-mono text-[12px] leading-none"
        >
          ✕
        </button>

        <div className="px-4 pt-3 pb-4">
          <p className="stamp pr-6">
            First time on the network · {cityName}
          </p>
          <p className="font-display font-black uppercase text-2xl leading-[0.95] tracking-[-0.01em] text-ink mt-1.5">
            Tap any station.
          </p>
          <p className="font-serif italic text-ink-soft text-[15px] leading-snug mt-2">
            Every dot is a real place to work. The lines are speed tiers —
            green rides video calls, red won&rsquo;t. Run a test where
            you&rsquo;re sitting to add your own.
          </p>

          <div className="flex items-center justify-between gap-3 mt-3.5">
            <Link
              href="?contribute=1"
              onClick={dismiss}
              className="bg-express text-cream font-mono text-[10px] tracking-[0.22em] uppercase px-3 py-2 hover:bg-express/90 transition-colors inline-flex items-center gap-1.5"
            >
              <span aria-hidden>+</span> Map a café
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint underline underline-offset-4 hover:text-ink transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
