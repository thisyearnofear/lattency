import { Suspense } from "react";
import Link from "next/link";
import { getCafes } from "@/lib/cafes";
import { TopNav } from "@/components/top-nav";
import { MapShell } from "@/components/map-shell";
import { StationDirectory } from "@/components/station-directory";
import { BountiesBoard } from "@/components/bounties-board";

// Re-fetched at most once per minute. The materialized view is refreshed
// after every POST /api/measurements, so reads stay close to live without
// hammering Aurora on every page view.
export const revalidate = 60;

export default async function Home() {
  const cafes = await getCafes();

  return (
    <>
      <TopNav current="app" />

      {/* Utility-first home — no scroll-driven cinematic. The cinematic
          experience lives at /tour for anyone who wants the long version. */}
      <main className="mx-auto max-w-[1440px] px-6 md:px-12">
        <section className="pt-8 md:pt-10 pb-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
              <p className="stamp">Nairobi · Live from PG_DB</p>
              <h1
                className="font-display font-black uppercase text-ink leading-[0.92] tracking-[-0.02em] mt-2"
                style={{ fontSize: "clamp(40px, 7vw, 96px)" }}
              >
                Where can you work
                <br />
                in Nairobi today?
              </h1>
              {/* Three-sided model in one line, sitting above the
                  existing editorial sub-line so the value prop reads
                  before the data. */}
              <p className="font-mono text-[11px] md:text-[12px] tracking-[0.22em] uppercase text-ink-soft mt-5">
                Contributors map.
                <span className="text-ink-faint mx-1.5">·</span>
                Sponsors fund coffees.
                <span className="text-ink-faint mx-1.5">·</span>
                You find the line you can actually work on.
              </p>
              <p className="font-serif italic text-ink-soft text-xl md:text-2xl mt-3 max-w-2xl">
                Twelve cafés today, anyone can add the thirteenth. Live
                wifi speeds from anyone with a connection — tap a station
                to see its measurements, drop a reading of your own.
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-6">
                <Link
                  href="/?contribute=1"
                  className="bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-4 py-2.5 inline-flex items-center gap-1.5 hover:bg-ink/90 transition-colors"
                >
                  <span aria-hidden>+</span> Map a café in 60 seconds
                </Link>
                <Link
                  href="/partners"
                  className="font-mono text-[11px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5"
                >
                  How sponsors pay <span aria-hidden>→</span>
                </Link>
              </div>
            </div>
            <Link
              href="/tour"
              className="font-mono text-[11px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5 pb-2"
            >
              Watch the story <span aria-hidden>→</span>
            </Link>
          </div>
        </section>

        {/* The map. Static (no scroll), interactive (click stations,
            toggle schematic ↔ geographic). */}
        {/* MapShell reads ?contribute=1 from the URL, so it must sit inside
            a Suspense boundary to keep the page statically prerenderable. */}
        <section className="mt-4 mb-10" aria-label="Café wifi network map">
          <Suspense fallback={null}>
            <MapShell cafes={cafes} />
          </Suspense>
        </section>

        {/* The directory. Search/filter/geolocation across the same data. */}
        <section>
          <StationDirectory cafes={cafes} />
        </section>

        {/* Monetization preview — the buymeacoffee-style bounty board. */}
        <section className="pb-24">
          <BountiesBoard />
        </section>

        {/* Footer — the global ambition tail lives at /tour now. */}
        <footer className="border-t border-ink/40 pt-6 pb-10 flex flex-wrap items-baseline justify-between gap-4 text-sm">
          <p className="stamp">
            Lattency · printed in Nairobi · {new Date().getFullYear()}
          </p>
          <p className="font-serif italic text-ink-faint">
            built on Aurora PostgreSQL · deployed on Vercel
          </p>
          <Link
            href="/tour"
            className="stamp hover:text-ink transition-colors"
          >
            Watch the story →
          </Link>
        </footer>
      </main>
    </>
  );
}
