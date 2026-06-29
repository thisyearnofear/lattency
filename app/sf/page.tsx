import type { Metadata } from "next";
import Link from "next/link";
import { getCafes } from "@/lib/cafes";
import { CITIES } from "@/lib/cities";
import { TopNav } from "@/components/top-nav";
import { MapShell } from "@/components/map-shell";
import { StationDirectory } from "@/components/station-directory";
import { BountiesBoard } from "@/components/bounties-board";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "San Francisco · Lattency",
  description:
    "The same engine, in a different city. Twelve real SF cafés mapped onto the three speed-tier lines.",
};

export default async function SFHome() {
  const cafes = await getCafes({ city: "sf" });
  const city = CITIES.sf;

  return (
    <>
      <TopNav current="app" currentCity="sf" />

      <main className="mx-auto max-w-[1440px] px-6 md:px-12">
        <section className="pt-8 md:pt-10 pb-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
              <p className="stamp">{city.name} · {city.country}</p>
              <h1
                className="font-display font-black uppercase text-ink leading-[0.92] tracking-[-0.02em] mt-2"
                style={{ fontSize: "clamp(40px, 7vw, 96px)" }}
              >
                Where can you work
                <br />
                in San Francisco today?
              </h1>
              <p className="font-serif italic text-ink-soft text-xl md:text-2xl mt-4 max-w-2xl">
                Twelve real {city.name} cafés on the same three speed-tier
                lines. Same engine that runs Nairobi — schematic positions
                auto-derived from each café&rsquo;s longitude.
              </p>
            </div>
            <Link
              href="/"
              className="font-mono text-[11px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5 pb-2"
            >
              <span aria-hidden>←</span> Nairobi
            </Link>
          </div>
        </section>

        <section className="mt-4 mb-10" aria-label="Café wifi network map">
          <MapShell cafes={cafes} city="sf" />
        </section>

        <section>
          <StationDirectory cafes={cafes} city="sf" />
        </section>

        <section className="pb-24">
          <BountiesBoard />
        </section>

        <footer className="border-t border-ink/40 pt-6 pb-10 flex flex-wrap items-baseline justify-between gap-4 text-sm">
          <p className="stamp">
            Lattency · printed in San Francisco · {new Date().getFullYear()}
          </p>
          <p className="font-serif italic text-ink-faint">
            mock data · proves the multi-city engine end to end
          </p>
          <Link href="/" className="stamp hover:text-ink transition-colors">
            ← Back to Nairobi
          </Link>
        </footer>
      </main>
    </>
  );
}
