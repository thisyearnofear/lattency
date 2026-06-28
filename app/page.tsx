import { getCafes } from "@/lib/cafes";
import { Masthead } from "@/components/masthead";
import { CinematicMap } from "@/components/cinematic-map";
import { Legend } from "@/components/legend";
import { StationIndex } from "@/components/station-index";

// Re-fetched at most once per minute. The materialized view is refreshed
// after every POST /api/measurements, so reads stay close to live without
// hammering Aurora on every page view.
export const revalidate = 60;

export default async function Home() {
  const cafes = await getCafes();

  return (
    <>
      <main className="mx-auto max-w-[1440px] px-6 md:px-12 pt-6 md:pt-10 pb-12">
        <Masthead />
      </main>

      {/* Cinematic map breaks out of the max-width container to fill the
          viewport while pinned. Self-contains its own horizontal padding. */}
      <CinematicMap cafes={cafes} />

      <main className="mx-auto max-w-[1440px] px-6 md:px-12 pb-24">
        <Legend />
        <StationIndex cafes={cafes} />

        {/* Global ambition tease — every metro system in the world is on the table */}
        <section className="mt-24 pt-10 border-t border-ink/80">
          <p className="stamp">Next stops</p>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-3 font-display font-black uppercase tracking-[-0.01em] text-3xl md:text-5xl">
            <span className="text-ink">Lagos</span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink">Cape Town</span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink">Accra</span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink">Kampala</span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink">Kigali</span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink-soft/40">your city</span>
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
