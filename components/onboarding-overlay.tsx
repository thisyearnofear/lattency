"use client";

// First-visit coach — a small dismissible ticket pinned to the map corner,
// never a blocking modal. Judges and curious users should be able to click
// straight through without being told what to do; the ticket is a nudge,
// not a gate. Shows once per browser. Newsprint ticket aesthetic.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useOverlay } from "@/components/overlay-context";
import { useMatchMedia } from "@/hooks/use-match-media";

const STORAGE_KEY = "lattency:onboarded:v1";

const EXIT_MS = 260;

type Phase = "hidden" | "entering" | "visible" | "leaving";

export function OnboardingOverlay({
  cityName,
  isEmpty = false,
}: {
  cityName: string;
  /** When true, the coach pushes mapping the first station. */
  isEmpty?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("hidden");
  const { active } = useOverlay();
  const isAnyOverlayOpen = active !== null;
  // Under md the full 290px ticket crowds the map — it renders as a slim
  // "? · Info" chip in the same corner; tapping expands the real ticket,
  // tapping ✕ dismisses it for good (same STORAGE_KEY as the full dismiss).
  const narrow = useMatchMedia("(max-width: 767px)");
  const [mobileExpanded, setMobileExpanded] = useState(false);

  // Refs so the suppression effect can read current values without depending
  // on them in its dep array. The previous version depended on `phase`, which
  // meant setting phase to "leaving" reran the effect, ran the cleanup, and
  // cancelled the very timeout that was supposed to advance to "hidden". The
  // ticket then stayed mounted, transparent (toast-out's final frame), and
  // pointer-events-auto at z-[600] — an invisible 290px click blocker.
  const phaseRef = useRef(phase);
  const overlayOpenRef = useRef(isAnyOverlayOpen);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    overlayOpenRef.current = isAnyOverlayOpen;
  }, [isAnyOverlayOpen]);

  // Entrance — runs once on mount. Checks the ref at fire time so we don't
  // slide the ticket in if an overlay opened during the 900ms delay.
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      /* storage unavailable — show the coach anyway */
    }
    const t = setTimeout(() => {
      if (!overlayOpenRef.current) setPhase("entering");
    }, 900);
    return () => clearTimeout(t);
  }, []);

  // Suppression — fires only when the overlay state *changes*. Reads the
  // current phase from a ref, so changing phase to "leaving" does NOT rerun
  // this effect and cancel the exit timeout. The timer lives in a ref so
  // that if the overlay closes within EXIT_MS, the effect's cleanup does
  // NOT cancel it — without this, the coach would be stuck in "leaving"
  // forever (mounted, transparent, no longer blocking but never returning).
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isAnyOverlayOpen) return;
    if (phaseRef.current === "hidden" || phaseRef.current === "leaving") return;
    setPhase("leaving");
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = setTimeout(() => {
      suppressTimerRef.current = null;
      setPhase("hidden");
    }, EXIT_MS);
    // No cleanup returned — the timer must survive this effect's rerun
    // when the overlay closes. It's cleared only on replacement (above)
    // or unmount (below).
  }, [isAnyOverlayOpen]);

  // Clear the suppression timer only on unmount.
  useEffect(() => {
    return () => {
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    };
  }, []);

  // Entering → visible (after the slide-in animation completes).
  useEffect(() => {
    if (phase === "entering") {
      const t = setTimeout(() => setPhase("visible"), 380);
      return () => clearTimeout(t);
    }
  }, [phase]);

  function dismiss() {
    setPhase("leaving");
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* non-fatal */
    }
    setTimeout(() => setPhase("hidden"), EXIT_MS);
  }

  if (phase === "hidden") return null;

  // Mobile collapsed state — the chip keeps the same corner anchor as the
  // ticket so expanding it doesn't jump across the screen. It must be
  // dismissible in-place: the ✕ runs the same dismiss() path as the full
  // ticket, persisting to STORAGE_KEY so it stays gone on reload.
  if (narrow && !mobileExpanded) {
    return (
      <div
        className={`fixed bottom-28 right-4 z-[600] ${
          phase === "leaving" ? "pointer-events-none toast-out" : "pointer-events-auto toast-in"
        }`}
        role="region"
        aria-label="Getting started with Lattency"
      >
        <div className="flex items-center bg-cream border border-ink shadow-[3px_4px_0_0_var(--color-ink)]">
          <button
            type="button"
            onClick={() => setMobileExpanded(true)}
            className="px-3 py-2.5 font-mono text-[10px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors"
            aria-label="Show getting started tips"
          >
            <span aria-hidden>? · </span>Info
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="px-2.5 py-2.5 border-l border-ink/20 font-mono text-[12px] leading-none text-ink-faint hover:text-ink transition-colors"
            aria-label="Dismiss getting started tip"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed bottom-28 right-4 sm:right-6 z-[600] w-[290px] max-w-[86vw] ${
        phase === "leaving" ? "pointer-events-none toast-out" : "pointer-events-auto toast-in"
      }`}
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
            {isEmpty ? "Draw the first line." : "Tap any station."}
          </p>
          <p className="font-serif italic text-ink-soft text-[15px] leading-snug mt-2">
            {isEmpty ? (
              <>
                This board is empty. Run a speed test where you&rsquo;re
                sitting — that reading opens {cityName} on the network.
              </>
            ) : (
              <>
                Every dot is a real place to work. The lines are speed tiers —
                green reads fast, red reads slow. Run a test where
                you&rsquo;re sitting to add your own.
              </>
            )}
          </p>

          <div className="flex items-center justify-between gap-3 mt-3.5">
            <Link
              href="?contribute=1"
              onClick={dismiss}
              className="bg-express text-cream font-mono text-[10px] tracking-[0.22em] uppercase px-3 py-2 hover:bg-express/90 transition-colors inline-flex items-center gap-1.5"
            >
              <span aria-hidden>+</span>{" "}
              {isEmpty ? "Map the first café" : "Map a café"}
            </Link>
            <Link
              href="/tour"
              onClick={dismiss}
              className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint underline underline-offset-4 hover:text-ink transition-colors"
            >
              Watch the reel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
