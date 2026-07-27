"use client";

// Dropdown surfacing the multi-city architecture. Live cities come from
// lib/cities.ts; adding a city there automatically surfaces it here.
// "Coming soon" slots are static teases of the global expansion story.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CITIES, CITY_ORDER, cityPath } from "@/lib/cities";
import type { CityId } from "@/lib/types";

type SoonCity = {
  id: CityId;
  name: string;
  country: string;
};

const SOON_CITIES: SoonCity[] = [
  { id: "lagos", name: "Lagos", country: "Nigeria" },
  { id: "capetown", name: "Cape Town", country: "South Africa" },
  { id: "accra", name: "Accra", country: "Ghana" },
  { id: "kampala", name: "Kampala", country: "Uganda" },
  { id: "kigali", name: "Kigali", country: "Rwanda" },
];

export function CitySwitcher({ current }: { current?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeName =
    (current && CITIES[current]?.name) ?? CITIES[CITY_ORDER[0]]?.name ?? "Cities";
  const liveCount = CITY_ORDER.length;

  // Warm the other cities' pages the moment the board opens, so switching
  // feels like a departure-board flip instead of a page load.
  useEffect(() => {
    if (!open) return;
    for (const cityId of CITY_ORDER) {
      if (cityId !== current) router.prefetch(cityPath(cityId));
    }
  }, [open, current, router]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 font-mono text-[10px] md:text-[11px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors"
      >
        {activeName}
        <span
          aria-hidden
          className={`text-[7px] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Switch city"
          className="absolute right-0 mt-3 w-72 bg-cream border border-ink/80 shadow-[6px_8px_0_0_var(--color-ink)] z-50"
        >
          <div className="px-4 py-3 border-b border-ink/15">
            <p className="stamp">
              Network · {liveCount} {liveCount === 1 ? "city" : "cities"} live
            </p>
            <p className="font-serif italic text-ink-faint text-xs mt-1">
              One engine, every city — schematic positions auto-derived from
              each café&rsquo;s longitude.
            </p>
          </div>

          <ul className="max-h-[60vh] overflow-y-auto">
            {CITY_ORDER.map((cityId, i) => {
              const city = CITIES[cityId];
              const isCurrent = cityId === current;
              return (
                <li key={cityId} className="flap-row" style={{ animationDelay: `${i * 45}ms` }}>
                  <Link
                    href={cityPath(cityId)}
                    onClick={() => setOpen(false)}
                    aria-current={isCurrent ? "page" : undefined}
                    className={`w-full px-4 py-3 flex items-baseline justify-between gap-3 text-left transition-colors ${
                      isCurrent ? "bg-cream-edge" : "bg-cream hover:bg-cream-edge"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-black uppercase tracking-[-0.01em] text-lg leading-none text-ink">
                        {city.name}
                      </p>
                      <p className="font-serif italic text-xs mt-0.5 text-ink-soft">
                        {city.country}
                      </p>
                    </div>
                    <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-express">
                      {isCurrent ? "Active" : "Live"}
                    </span>
                  </Link>
                </li>
              );
            })}

            {SOON_CITIES.length > 0 && (
              <li className="px-4 py-2 border-t border-ink/10">
                <p className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-faint">
                  Coming soon
                </p>
              </li>
            )}
            {SOON_CITIES.map((slot) => (
              <li key={slot.id}>
                <button
                  type="button"
                  disabled
                  className="w-full px-4 py-3 flex items-baseline justify-between gap-3 text-left bg-cream cursor-not-allowed"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-black uppercase tracking-[-0.01em] text-lg leading-none text-ink-faint">
                      {slot.name}
                    </p>
                    <p className="font-serif italic text-xs mt-0.5 text-ink-faint/70">
                      {slot.country}
                    </p>
                  </div>
                  <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-faint">
                    Coming soon
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="px-4 py-3 border-t border-ink/15 bg-cream-edge/40">
            <p className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-faint">
              Your city missing?{" "}
              <a href={`${cityPath(current && CITIES[current] ? current : CITY_ORDER[0])}?contribute=1`} className="text-ink">
                Map a café →
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
