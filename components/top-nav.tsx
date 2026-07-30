import Link from "next/link";
import { CitySwitcher } from "./city-switcher";
import { BrandMark } from "./brand-mark";
import { LiveNetworkBadge } from "./live-network-badge";
import { cityPath, DEFAULT_CITY_ID, type LiveCity } from "@/lib/cities";

/**
 * Thin sticky nav surfaced on every primary route. Stays a synchronous
 * server component so the pages it sits on can be statically prerendered.
 *
 * - `current` controls the active route highlight
 * - `currentCity` controls the active city in the city switcher dropdown
 * - `currentCityName` is used when the city is not one of the curated three
 * - `liveCities` populates the switcher with cities that actually have cafés
 *
 * Layout: BrandMark · wordmark · CitySwitcher  on the left.
 *          Map · Partners · (+ Map a café CTA) on the right.
 * The CTA links to /{city}?contribute=1 so any city page can open the
 * contribution modal automatically — useful from any sub-route.
 */
export function TopNav({
  current,
  currentCity = DEFAULT_CITY_ID,
  currentCityName,
  liveCities,
}: {
  current: "app" | "tour" | "partners";
  currentCity?: string;
  currentCityName?: string;
  liveCities?: LiveCity[];
}) {
  const cityHome = cityPath(currentCity || DEFAULT_CITY_ID);
  const contributeHref = `${cityHome}?contribute=1`;

  return (
    <nav
      className="sticky top-0 z-40 border-b border-ink/15 bg-cream/90 backdrop-blur-md"
      aria-label="Primary"
      style={{ viewTransitionName: "site-nav" }}
    >
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 md:px-12 h-14 flex items-center justify-between gap-3 sm:gap-6">
        <div className="flex items-center gap-3 sm:gap-5 md:gap-8 min-w-0">
          <Link
            href={cityHome}
            aria-label="Lattency home"
            className="flex items-center gap-2 font-display font-black uppercase text-[22px] leading-none tracking-[-0.02em] text-ink shrink-0"
          >
            <BrandMark size={26} decorative />
            {/* On the narrowest phones only the mark shows — the wordmark
                costs ~90px that the action group needs. */}
            <span className="hidden min-[400px]:inline">Lattency</span>
          </Link>
          <span aria-hidden className="text-ink-faint hidden sm:inline">·</span>
          <CitySwitcher
            current={currentCity}
            currentName={currentCityName}
            liveCities={liveCities}
          />
          {/* The live status dot is ambient nav chrome — hide it below md to
              preserve room for the actions on small screens. */}
          <span aria-hidden className="text-ink-faint hidden md:inline">·</span>
          <div className="hidden md:block">
            <LiveNetworkBadge variant="nav" />
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3 md:gap-5 font-mono text-[10px] md:text-[11px] tracking-[0.22em] uppercase">
          {current === "tour" ? (
            <Link
              href={cityHome}
              className="text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span aria-hidden>←</span>
              <span className="hidden sm:inline">Back to map</span>
              <span className="sm:hidden">Back</span>
            </Link>
          ) : (
            // Redundant while we're already on the map — hiding it on the
            // smallest screens reclaims space without losing a destination.
            <Link
              href={cityHome}
              className={
                current === "app"
                  ? "hidden sm:inline-flex text-ink"
                  : "text-ink-soft hover:text-ink transition-colors inline-flex"
              }
            >
              Map
            </Link>
          )}

          <Link
            href="/partners"
            className={
              current === "partners"
                ? "text-ink hidden sm:inline"
                : "text-ink-soft hover:text-ink transition-colors hidden sm:inline"
            }
          >
            Partners
          </Link>

          <Link
            href="/speedtest"
            className="text-ink-soft hover:text-ink transition-colors hidden sm:inline"
          >
            Test my wifi
          </Link>

          {/* Primary CTA — ink-filled so it reads as the action of the nav. */}
          <Link
            href={contributeHref}
            className="pressable bg-ink text-cream hover:bg-ink/90 px-3 py-1.5 inline-flex items-center gap-1.5"
          >
            <span aria-hidden>+</span>
            <span className="hidden sm:inline">Map a café</span>
            <span className="sm:hidden">Map</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
