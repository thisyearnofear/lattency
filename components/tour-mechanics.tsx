"use client";

// Outcome strip — deepens the reel with five sticky “what you get” beats
// between product proof and the cinematic ride. Mobile: horizontal snap.
// Desktop: five equal columns.

import { LOOP_STEPS } from "@/lib/tour-loop";

const OUTCOMES = [
  { verb: "Tap", result: "A real place, not a review." },
  { verb: "Read", result: "Verified speeds, not vibes." },
  { verb: "Test", result: "Edge round-trip you can’t fake." },
  { verb: "Land", result: "Your pin extends the line." },
  { verb: "Earn", result: "NIM when a bounty closes." },
] as const;

export function TourMechanics() {
  return (
    <section
      className="mx-auto max-w-[1440px] px-4 sm:px-6 md:px-12 pt-12 md:pt-16"
      aria-label="What the loop delivers"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="stamp">The mechanism · five beats</p>
          <h2
            className="font-display font-black uppercase text-ink leading-[0.9] tracking-[-0.02em] mt-1"
            style={{ fontSize: "clamp(28px, 4.5vw, 44px)" }}
          >
            Proof, then payout.
          </h2>
        </div>
        <p className="font-serif italic text-ink-soft text-base max-w-md">
          Same five steps as the reel — written as outcomes so the story
          sticks after the animation ends.
        </p>
      </div>

      <ol className="flex md:grid md:grid-cols-5 gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 scrollbar-none">
        {OUTCOMES.map((o, i) => (
          <li
            key={o.verb}
            className="snap-start shrink-0 w-[78vw] max-w-[280px] md:w-auto md:max-w-none border border-ink/80 bg-cream shadow-[3px_4px_0_0_var(--color-ink)] px-4 py-4"
          >
            <p className="stamp text-ink-faint">
              {LOOP_STEPS[i]?.n ?? String(i + 1).padStart(2, "0")}
            </p>
            <p className="font-display font-black uppercase text-3xl leading-none tracking-[-0.01em] text-ink mt-1">
              {o.verb}
            </p>
            <p className="font-serif italic text-ink-soft text-[15px] leading-snug mt-2">
              {o.result}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
