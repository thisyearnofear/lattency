import Link from "next/link";
import { CitySwitcher } from "./city-switcher";
import { BrandMark } from "./brand-mark";

/**
 * Thin sticky nav surfaced on /, /sf, /tour, and the per-café pages.
 * - `current` controls the highlighted route link
 * - `currentCity` controls the active city in the city switcher dropdown
 */
export function TopNav({
  current,
  currentCity = "nairobi",
}: {
  current: "app" | "tour";
  currentCity?: string;
}) {
  return (
    <nav
      className="sticky top-0 z-40 border-b border-ink/15 bg-cream/90 backdrop-blur-md"
      aria-label="Primary"
    >
      <div className="mx-auto max-w-[1440px] px-6 md:px-12 h-14 flex items-center justify-between gap-6">
        <div className="flex items-center gap-5 md:gap-8">
          <Link
            href="/"
            aria-label="Lattency home"
            className="flex items-center gap-2 font-display font-black uppercase text-[22px] leading-none tracking-[-0.02em] text-ink"
          >
            <BrandMark size={26} decorative />
            <span>Lattency</span>
          </Link>
          <span aria-hidden className="text-ink-faint hidden md:inline">·</span>
          <div className="hidden md:block">
            <CitySwitcher current={currentCity} />
          </div>
        </div>

        <div className="flex items-center gap-5 md:gap-8 font-mono text-[10px] md:text-[11px] tracking-[0.22em] uppercase">
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
          <Link
            href="/tour"
            className={`inline-flex items-center gap-1.5 transition-colors ${
              current === "tour" ? "text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            {current === "tour" ? (
              <>
                <span aria-hidden>←</span> Back to map
              </>
            ) : (
              <>
                Watch the story <span aria-hidden>→</span>
              </>
            )}
          </Link>
        </div>
      </div>
    </nav>
  );
}
