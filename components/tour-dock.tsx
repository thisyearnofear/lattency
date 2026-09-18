"use client";

// Sticky conversion dock — mobile/tablet only. Keeps the primary tour CTA
// reachable while the reel and cinematic ride scroll past.

import Link from "next/link";
import { cityPath, DEFAULT_CITY_ID } from "@/lib/cities";

export function TourDock() {
  const mapHref = cityPath(DEFAULT_CITY_ID);
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 lg:hidden border-t border-ink/80 bg-cream/95 backdrop-blur-md"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-[1440px] px-4 pt-3 flex items-center gap-2">
        <Link
          href={mapHref}
          className="pressable flex-1 bg-ink text-cream font-mono text-[11px] tracking-[0.2em] uppercase px-4 py-3 text-center inline-flex items-center justify-center gap-2 shadow-[3px_3px_0_0_var(--color-ink)]"
        >
          Open the map <span aria-hidden>→</span>
        </Link>
        <Link
          href={`${mapHref}?contribute=1`}
          className="pressable shrink-0 border border-ink/80 bg-cream text-ink font-mono text-[11px] tracking-[0.18em] uppercase px-3 py-3 inline-flex items-center justify-center gap-1.5"
        >
          <span aria-hidden>+</span> Map
        </Link>
      </div>
    </div>
  );
}
