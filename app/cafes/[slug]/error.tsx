"use client";

// Per-café page error boundary — a single café failing to render
// shouldn't blow up the rest of the app. Keeps the surrounding nav
// intact and offers the user a clean way back to the map.

import { useEffect } from "react";
import Link from "next/link";

export default function CafePageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof console !== "undefined") {
      console.error("[lattency][cafe-page-error]", error);
    }
  }, [error]);

  return (
    <main className="mx-auto max-w-[800px] px-6 md:px-12 pt-12 pb-24 text-center">
      <p className="stamp">Station unreadable</p>
      <h1
        className="font-display font-black uppercase text-ink leading-[0.92] tracking-[-0.02em] mt-3"
        style={{ fontSize: "clamp(36px, 6vw, 64px)" }}
      >
        Couldn&rsquo;t draw this café.
      </h1>
      <p className="font-serif italic text-ink-soft text-lg md:text-xl mt-4">
        Something on this café&rsquo;s page didn&rsquo;t load right.
        Try refreshing — if it keeps happening, the station may be
        temporarily out of service.
      </p>
      {error.digest && (
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint mt-6">
          Reference: <span className="text-ink">{error.digest}</span>
        </p>
      )}
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
          All stations
        </Link>
      </div>
    </main>
  );
}
