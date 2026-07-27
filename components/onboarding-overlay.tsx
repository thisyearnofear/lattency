"use client";

// First-visit coach — three beats, no carousel, no "next" buttons to hunt
// for. It points at the real interface: the map (tap a station), the tier
// legend (what the lines mean), and the contribute CTA (add your own).
// Shows once per browser, dismisses on any tap. Newsprint ticket aesthetic.

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "lattency:onboarded:v1";

type Beat = 0 | 1 | 2;

export function OnboardingOverlay({ cityName }: { cityName: string }) {
  const [visible, setVisible] = useState(false);
  const [beat, setBeat] = useState<Beat>(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      /* storage unavailable — show the coach anyway */
    }
    // Let the page settle before fading the coach in.
    const t = setTimeout(() => setVisible(true), 700);
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

  function advance() {
    if (beat < 2) setBeat((beat + 1) as Beat);
    else dismiss();
  }

  if (!visible) return null;

  const beats = [
    {
      kicker: "Welcome to the network",
      title: `This is ${cityName}'s wifi map.`,
      body: "Every dot is a real place to work. The coloured lines are speed tiers, like a metro map. Tap any station to see its verified readings.",
      cta: "Show me",
    },
    {
      kicker: "Read the lines",
      title: "Three lines, three speeds.",
      body: "Express (green) handles video calls. Local (amber) is fine for email and browsing. Suspended (red) means think twice before you order. The badge on each card tells you which.",
      cta: "Got it",
    },
    {
      kicker: "Your turn",
      title: "Add a station in 60 seconds.",
      body: "Run a real speed test from wherever you're sitting and a new station appears on the map. Contributors keep the network honest — and earn NIM for closed bounties.",
      cta: "Start exploring",
    },
  ] as const;

  const b = beats[beat];

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="How Lattency works"
    >
      {/* Scrim — click anywhere to advance / dismiss. */}
      <button
        type="button"
        aria-label="Dismiss onboarding"
        onClick={advance}
        className="absolute inset-0 bg-ink/55 cursor-default"
      />

      <div className="toast-in relative w-full max-w-md bg-cream border-2 border-ink shadow-[6px_8px_0_0_var(--color-ink)]">
        {/* Ticket header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink/20 bg-cream-edge/50">
          <p className="stamp">{b.kicker}</p>
          <div className="flex items-center gap-1.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`w-2 h-2 ${i === beat ? "bg-ink" : "bg-ink/25"}`}
              />
            ))}
          </div>
        </div>

        <div className="px-6 py-6">
          <h2 className="font-display font-black uppercase text-3xl leading-[0.95] tracking-[-0.01em] text-ink">
            {b.title}
          </h2>
          <p className="font-serif italic text-ink-soft text-lg leading-snug mt-4">
            {b.body}
          </p>

          <div className="flex items-center justify-between gap-3 mt-7">
            <button
              type="button"
              onClick={dismiss}
              className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint underline underline-offset-4 hover:text-ink transition-colors"
            >
              Skip
            </button>
            <Link
              href={`?contribute=1`}
              onClick={dismiss}
              className={`${beat === 2 ? "" : "hidden"} bg-express text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-4 py-2.5 hover:bg-express/90 transition-colors inline-flex items-center gap-1.5`}
            >
              <span aria-hidden>+</span> Map a café
            </Link>
            <button
              type="button"
              onClick={advance}
              className="bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-4 py-2.5 hover:bg-ink/90 transition-colors"
            >
              {b.cta}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
