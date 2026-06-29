"use client";

// Route-level error boundary — catches anything that escapes the
// individual page boundaries and renders a recoverable "something went
// wrong" surface instead of a 500 page. Stays in the poster aesthetic so
// it doesn't feel like a browser error.

import { useEffect } from "react";
import Link from "next/link";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in dev console; in production Vercel collects the same
    // unhandled error via its built-in error reporting.
    if (typeof console !== "undefined") {
      console.error("[lattency][route-error]", error);
    }
  }, [error]);

  return (
    <main className="min-h-screen bg-cream text-ink flex items-center justify-center px-6 py-16">
      <div className="max-w-xl text-center">
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-faint">
          Service interruption
        </p>
        <h1
          className="font-display font-black uppercase leading-[0.92] tracking-[-0.02em] text-ink mt-4"
          style={{ fontSize: "clamp(40px, 7vw, 80px)" }}
        >
          Suspended line.
        </h1>
        <p className="font-serif italic text-ink-soft text-lg md:text-xl mt-4">
          Something on this page didn&rsquo;t draw cleanly. The rest of the
          map is fine — try again or head back to the homepage.
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
            Back to the map
          </Link>
        </div>
      </div>
    </main>
  );
}
