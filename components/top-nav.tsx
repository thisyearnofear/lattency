import Link from "next/link";
import { CitySwitcher } from "./city-switcher";
import { BrandMark } from "./brand-mark";
import { AuthSlot } from "./auth-slot";

/**
 * Thin sticky nav surfaced on every primary route. Stays a synchronous
 * server component so the pages it sits on can be statically prerendered
 * — the auth-aware UI lives in `<AuthSlot/>`, which fetches the session
 * client-side after hydration.
 *
 * - `current` controls the active route highlight
 * - `currentCity` controls the active city in the city switcher dropdown
 *
 * Layout: BrandMark · wordmark · CitySwitcher  on the left.
 *          Map · Partners · AuthSlot · (+ Map a café CTA) on the right.
 * The CTA links to /?contribute=1 so the homepage can open the
 * contribution modal automatically — useful from any sub-route.
 */
export function TopNav({
  current,
  currentCity = "nairobi",
}: {
  current: "app" | "tour" | "partners" | "me" | "auth";
  currentCity?: string;
}) {
  const cityHome = currentCity === "sf" ? "/sf" : "/";
  const contributeHref = `${cityHome}?contribute=1`;
  return (
    <nav
      className="sticky top-0 z-40 border-b border-ink/15 bg-cream/90 backdrop-blur-md"
      aria-label="Primary"
    >
      <div className="mx-auto max-w-[1440px] px-6 md:px-12 h-14 flex items-center justify-between gap-6">
        <div className="flex items-center gap-5 md:gap-8 min-w-0">
          <Link
            href="/"
            aria-label="Lattency home"
            className="flex items-center gap-2 font-display font-black uppercase text-[22px] leading-none tracking-[-0.02em] text-ink shrink-0"
          >
            <BrandMark size={26} decorative />
            <span>Lattency</span>
          </Link>
          <span aria-hidden className="text-ink-faint hidden md:inline">·</span>
          <div className="hidden md:block">
            <CitySwitcher current={currentCity} />
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-5 font-mono text-[10px] md:text-[11px] tracking-[0.22em] uppercase">
          {current === "tour" ? (
            <Link
              href="/"
              className="text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5"
            >
              <span aria-hidden>←</span> Back to map
            </Link>
          ) : (
            <Link
              href="/"
              className={
                current === "app"
                  ? "text-ink"
                  : "text-ink-soft hover:text-ink transition-colors"
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

          <AuthSlot current={current} />

          {/* Primary CTA — ink-filled so it reads as the action of the nav. */}
          <Link
            href={contributeHref}
            className="bg-ink text-cream hover:bg-ink/90 transition-colors px-3 py-1.5 inline-flex items-center gap-1.5"
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
