import type { Metadata } from "next";
import { getCafes } from "@/lib/cafes";
import { TopNav } from "@/components/top-nav";
import { Masthead } from "@/components/masthead";
import { CinematicMap } from "@/components/cinematic-map";
import { Legend } from "@/components/legend";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "The Tour",
  description:
    "A cinematic ride down each line. The story of Lattency — twelve stations, three tiers, one engine.",
};

export default async function Tour() {
  const cafes = await getCafes();

  return (
    <>
      <TopNav current="tour" />

      <main className="mx-auto max-w-[1440px] px-6 md:px-12 pt-6 md:pt-10 pb-12">
        <Masthead />
      </main>

      <CinematicMap cafes={cafes} />

      <main className="mx-auto max-w-[1440px] px-6 md:px-12 pb-24">
        <Legend />

        {/* Global ambition tease — preserved from the original home */}
        <section className="mt-24 pt-10 border-t border-ink/80">
          <p className="stamp">Next stops</p>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-3 font-display font-black uppercase tracking-[-0.01em] text-3xl md:text-5xl">
            <span className="text-ink transition-colors duration-200 hover:text-express cursor-default">
              Lagos
            </span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink transition-colors duration-200 hover:text-express cursor-default">
              Cape Town
            </span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink transition-colors duration-200 hover:text-express cursor-default">
              Accra
            </span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink transition-colors duration-200 hover:text-express cursor-default">
              Kampala
            </span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink transition-colors duration-200 hover:text-express cursor-default">
              Kigali
            </span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink-soft/40 transition-colors duration-200 hover:text-express cursor-default">
              your city
            </span>
          </div>
          <p className="font-serif italic text-ink-faint text-base md:text-lg mt-4 max-w-3xl">
            One engine. Three lines. Twelve stations today, twelve thousand soon.
            Anywhere a café offers wifi, a station belongs on the map.
          </p>
        </section>

        <footer className="mt-16 pt-6 border-t border-ink/40 flex flex-wrap items-baseline justify-between gap-4">
          <p className="stamp">
            Lattency · printed in Nairobi · {new Date().getFullYear()}
          </p>
          <p className="font-serif italic text-ink-faint text-sm">
            a hackathon submission · Vercel × AWS Databases
          </p>
          <p className="stamp">Set in Big Shoulders &amp; IBM Plex Mono</p>
        </footer>
      </main>
    </>
  );
}
