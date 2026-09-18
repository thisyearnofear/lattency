import type { Metadata } from "next";
import { getCafes } from "@/lib/cafes";
import { TopNav } from "@/components/top-nav";
import { CinematicMap } from "@/components/cinematic-map";
import { Legend } from "@/components/legend";
import { TourActOne } from "@/components/tour-act-one";
import { TourMechanics } from "@/components/tour-mechanics";
import { TourHandoff } from "@/components/tour-handoff";
import { TourFinale } from "@/components/tour-finale";
import { TourDock } from "@/components/tour-dock";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "The Tour — feel the loop in sixty seconds",
  description:
    "Watch Lattency's product loop on a self-running reel — tap, read, test, land, earn — then open a live city and run it yourself.",
  openGraph: {
    title: "Lattency · The Tour",
    description:
      "Sixty seconds start to finish. The metro map of workable wifi, running itself.",
  },
};

export default async function Tour() {
  const cafes = await getCafes();

  return (
    <>
      <TopNav current="tour" />

      {/* Act 01 — boarding + hero + mobile/desktop reel */}
      <TourActOne />

      {/* Mechanism strip — outcomes after the proof */}
      <TourMechanics />

      {/* Act 02 — cinematic line ride (shorter scroll on mobile) */}
      <TourHandoff />
      <CinematicMap cafes={cafes} />

      <main className="mx-auto max-w-[1440px] px-4 sm:px-6 md:px-12 pb-28 lg:pb-24">
        <Legend />
        <TourFinale />

        <section className="mt-16 sm:mt-24 pt-8 sm:pt-10 border-t border-ink/80">
          <p className="stamp">Next stops</p>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-5 sm:gap-x-8 gap-y-2 sm:gap-y-3 font-display font-black uppercase tracking-[-0.01em] text-2xl sm:text-3xl md:text-5xl">
            {["Lagos", "Cape Town", "Accra", "Kampala", "Kigali"].map(
              (city, i) => (
                <span key={city} className="inline-flex items-baseline gap-x-5 sm:gap-x-8">
                  {i > 0 && <span className="text-ink-faint">·</span>}
                  <span className="text-ink transition-colors duration-200 hover:text-express cursor-default">
                    {city}
                  </span>
                </span>
              ),
            )}
            <span className="inline-flex items-baseline gap-x-5 sm:gap-x-8">
              <span className="text-ink-faint">·</span>
              <span className="text-ink-soft/40 transition-colors duration-200 hover:text-express cursor-default">
                your city
              </span>
            </span>
          </div>
          <p className="font-serif italic text-ink-faint text-base md:text-lg mt-4 max-w-3xl">
            One engine. Three lines. Twelve stations today, twelve thousand soon.
            Anywhere a café offers wifi, a station belongs on the map.
          </p>
        </section>

        <footer className="mt-12 sm:mt-16 pt-6 border-t border-ink/40 flex flex-wrap items-baseline justify-between gap-4">
          <p className="stamp">
            Lattency · live network · {new Date().getFullYear()}
          </p>
          <p className="stamp">Set in Big Shoulders &amp; IBM Plex Mono</p>
        </footer>
      </main>

      <TourDock />
    </>
  );
}
