import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getCafes } from "@/lib/cafes";
import { CITIES, cityPath, resolveCityConfig, getLiveCities } from "@/lib/cities";
import { TopNav } from "@/components/top-nav";
import { LiveMap } from "@/components/live-map";
import { StationDirectory } from "@/components/station-directory";
import { BountiesBoard } from "@/components/bounties-board";
import { MapToastProvider } from "@/components/map-toast";
import { OnboardingOverlay } from "@/components/onboarding-overlay";
import { OverlayProvider } from "@/components/overlay-context";
import { CityVisitTracker } from "@/components/city-visit-tracker";

export const revalidate = 60;
// Allow any city slug to render dynamically; curated cities are still
// pre-rendered at build time.
export const dynamicParams = true;

export async function generateStaticParams() {
  return Object.keys(CITIES).map((city) => ({ city }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const allCafes = await getCafes({ all: true });
  const config = resolveCityConfig(city, allCafes);
  const description = `Where can you work in ${config.name} today? Verified wifi speeds for cafés, coworking spaces, and hotel lobbies — mapped like a metro network.`;

  return {
    title: `${config.name} wifi`,
    description,
    openGraph: {
      type: "website",
      siteName: "Lattency",
      title: `${config.name} wifi · Lattency`,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${config.name} wifi · Lattency`,
      description,
    },
  };
}

export default async function CityHome({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const allCafes = await getCafes({ all: true });
  const cityConfig = resolveCityConfig(city, allCafes);
  const cafes = await getCafes({ city });
  const liveCities = getLiveCities(allCafes);
  const otherCities = liveCities.filter((c) => c.id !== city).slice(0, 5);

  return (
    <MapToastProvider>
      <OverlayProvider>
      <TopNav
        current="app"
        currentCity={city}
        currentCityName={cityConfig.name}
        liveCities={liveCities}
      />

      <CityVisitTracker city={city} />

      <main className="mx-auto max-w-[1440px] px-6 md:px-12">
        <section className="pt-8 md:pt-10 pb-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
              <p className="stamp">{cityConfig.name} · {cityConfig.country}</p>
              <h1
                className="font-display font-black uppercase text-ink leading-[0.92] tracking-[-0.02em] mt-2"
                style={{ fontSize: "clamp(40px, 7vw, 96px)" }}
              >
                Where can you work
                <br />
                in {cityConfig.name} today?
              </h1>
              <p className="font-mono text-[11px] md:text-[12px] tracking-[0.22em] uppercase text-ink-soft mt-5">
                Contributors map.
                <span className="text-ink-faint mx-1.5">·</span>
                Sponsors fund coffees.
                <span className="text-ink-faint mx-1.5">·</span>
                You find the line you can actually work on.
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-6">
                <Link
                  href={`${cityPath(city)}?contribute=1`}
                  className="bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-4 py-2.5 inline-flex items-center gap-1.5 hover:bg-ink/90 transition-colors"
                >
                  <span aria-hidden>+</span> Map a café in 60 seconds
                </Link>
                <Link
                  href="/speedtest"
                  className="font-mono text-[11px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5"
                >
                  Test my wifi <span aria-hidden>→</span>
                </Link>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 pb-2">
              {otherCities.map((c) => (
                <Link
                  key={c.id}
                  href={cityPath(c.id)}
                  className="font-mono text-[11px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5"
                >
                  {c.name} <span aria-hidden>→</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-4 mb-10" aria-label={`${cityConfig.name} workspace network map`}>
          <Suspense fallback={null}>
            <LiveMap initialCafes={cafes} city={city} cityConfig={cityConfig} />
          </Suspense>
        </section>

        <section>
          <StationDirectory cafes={cafes} city={city} cityConfig={cityConfig} />
        </section>

        <section className="pb-24">
          <BountiesBoard city={city} cafeCount={cafes.length} />
        </section>

        <footer className="border-t border-ink/40 pt-6 pb-10 flex flex-wrap items-baseline justify-between gap-4 text-sm">
          <p className="stamp">
            Lattency · printed in {cityConfig.name} · {new Date().getFullYear()}
          </p>
          <p className="font-serif italic text-ink-faint">
            built on Base44 · powered by Nimiq Pay · deployed on Vercel
          </p>
          <Link
            href="/tour"
            className="stamp hover:text-ink transition-colors"
          >
            Watch the story →
          </Link>
        </footer>
      </main>

      <OnboardingOverlay cityName={cityConfig.name} />
      </OverlayProvider>
    </MapToastProvider>
  );
}
