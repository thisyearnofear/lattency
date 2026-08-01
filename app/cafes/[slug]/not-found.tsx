import Link from "next/link";
import { DEFAULT_CITY_ID, cityPath } from "@/lib/cities";

// Station not on the line — the 404 for /cafes/[slug]. Instead of a dead
// end, we treat the missing slug as an opportunity: the café they were
// looking for simply hasn't been mapped yet, and the CTA hands them the pen.
// (The slug itself isn't recoverable as a display name once the route 404s,
// so we keep the copy about the network rather than the specific café.)

export default function StationNotFound() {
  return (
    <main className="mx-auto max-w-[760px] px-6 md:px-12 pt-16 pb-24 text-center">
      {/* A dashed roundel, like a station that was planned but never built. */}
      <div
        aria-hidden
        className="mx-auto w-16 h-16 rounded-full border-[3px] border-dashed border-ink/40 grid place-items-center"
      >
        <span className="font-display font-black text-2xl text-ink-faint/60">?</span>
      </div>

      <p className="stamp mt-6">Station not on the line</p>
      <h1
        className="font-display font-black uppercase text-ink leading-[0.92] tracking-[-0.02em] mt-3"
        style={{ fontSize: "clamp(36px, 6vw, 60px)" }}
      >
        This café isn&rsquo;t mapped yet.
      </h1>
      <p className="font-serif italic text-ink-soft text-lg md:text-xl mt-4 max-w-lg mx-auto">
        Every dot on Lattency is a real place someone actually measured.
        This one isn&rsquo;t on the network — which means it&rsquo;s waiting
        for a pioneer.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
        <Link
          href={`${cityPath(DEFAULT_CITY_ID)}?contribute=1`}
          className="bg-ink text-cream font-mono text-xs tracking-[0.22em] uppercase px-4 py-3 inline-flex items-center gap-1.5 hover:bg-ink/90 transition-colors"
        >
          <span aria-hidden>+</span> Map it in 60 seconds
        </Link>
        <Link
          href={cityPath(DEFAULT_CITY_ID)}
          className="font-mono text-xs tracking-[0.22em] uppercase px-4 py-3 border border-ink/40 text-ink-soft hover:border-ink hover:text-ink transition-colors"
        >
          Back to the map
        </Link>
      </div>
    </main>
  );
}
