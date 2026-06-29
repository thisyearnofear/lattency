"use client";

// /me dashboard error boundary — read failures (e.g. DB hiccup) shouldn't
// log the user out or trap them on a 500 page.

import { useEffect } from "react";
import Link from "next/link";

export default function MeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof console !== "undefined") {
      console.error("[lattency][me-error]", error);
    }
  }, [error]);

  return (
    <main className="mx-auto max-w-[640px] px-6 md:px-12 pt-12 pb-24 text-center">
      <p className="stamp">Your contributions · temporarily unavailable</p>
      <h1
        className="font-display font-black uppercase text-ink leading-[0.92] tracking-[-0.02em] mt-3"
        style={{ fontSize: "clamp(36px, 6vw, 64px)" }}
      >
        Couldn&rsquo;t pull your stats.
      </h1>
      <p className="font-serif italic text-ink-soft text-lg mt-4">
        We hit a wall trying to load your contributions. Your data is
        safe — this is a read-side hiccup. Try again, or come back in a
        minute.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
        <button
          type="button"
          onClick={reset}
          className="bg-ink text-cream font-mono text-xs tracking-[0.22em] uppercase px-4 py-3 hover:bg-ink/90 transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="font-mono text-xs tracking-[0.22em] uppercase px-4 py-3 border border-ink/40 text-ink-soft hover:border-ink hover:text-ink transition-colors"
        >
          Back to the map
        </Link>
      </div>
    </main>
  );
}
