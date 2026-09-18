"use client";

// Dropdown surfacing the multi-city architecture. Live cities come from
// lib/cities.ts; adding a city there automatically surfaces it here.
// Anyone can open a new board via the form — first reading draws the line.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CITIES, CITY_ORDER, cityPath, type LiveCity } from "@/lib/cities";
import type { CityId } from "@/lib/types";
import { VTLink } from "./vt-link";
import { OpenCityForm } from "./open-city-form";

type SuggestedCity = {
  id: CityId;
  name: string;
  country: string;
};

/** Starter boards people can open before any readings exist. */
const SUGGESTED_CITIES: SuggestedCity[] = [
  { id: "lagos", name: "Lagos", country: "Nigeria" },
  { id: "cape-town", name: "Cape Town", country: "South Africa" },
  { id: "accra", name: "Accra", country: "Ghana" },
  { id: "berlin", name: "Berlin", country: "Germany" },
  { id: "new-york", name: "New York", country: "USA" },
];

export function CitySwitcher({
  current,
  currentName,
  liveCities,
}: {
  current?: string;
  currentName?: string;
  liveCities?: LiveCity[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Board stays mounted while closing so the split-flap exit plays before
  // unmounting.
  const [mounted, setMounted] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const cities = useMemo(
    () => liveCities ?? CITY_ORDER.map((id) => ({ ...CITIES[id], count: 0 })),
    [liveCities],
  );

  const liveIds = useMemo(() => new Set(cities.map((c) => c.id)), [cities]);

  const suggestions = useMemo(
    () => SUGGESTED_CITIES.filter((s) => !liveIds.has(s.id) && s.id !== current),
    [liveIds, current],
  );

  const activeName =
    currentName ??
    (current && CITIES[current]?.name) ??
    cities.find((c) => c.id === current)?.name ??
    CITIES[CITY_ORDER[0]]?.name ??
    "Cities";
  const liveCount = cities.filter((c) => c.count > 0 || CITY_ORDER.includes(c.id)).length;

  const openBoard = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setMounted(true);
    setOpen(true);
  }, []);

  const closeBoard = useCallback(() => {
    setOpen(false);
    closeTimer.current = setTimeout(() => setMounted(false), 220);
  }, []);

  // Warm the other cities' pages as soon as the switcher mounts (not when
  // the board opens — by then the user is already mid-switch and the RSC
  // payload may not land before they click). Routes are static + tiny.
  useEffect(() => {
    for (const city of cities) {
      if (city.id !== current) router.prefetch(cityPath(city.id));
    }
  }, [current, cities, router]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) closeBoard();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeBoard();
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, closeBoard]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? closeBoard() : openBoard())}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="pressable inline-flex items-center gap-1.5 font-mono text-[10px] md:text-[11px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink"
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

      {mounted && (
        <div
          role="listbox"
          aria-label="Switch city"
          className={`fixed left-2 right-2 top-14 w-auto sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-3 sm:w-80 bg-cream border border-ink/80 shadow-[6px_8px_0_0_var(--color-ink)] z-50 ${
            open ? "" : "board-closing"
          }`}
        >
          <div className="px-4 py-3 border-b border-ink/15">
            <p className="stamp">
              Network · {liveCount} {liveCount === 1 ? "city" : "cities"} live
            </p>
            <p className="font-serif italic text-ink-faint text-xs mt-1">
              One engine, every city — open a board anywhere; the first
              reading draws the line.
            </p>
          </div>

          <ul className="max-h-[40vh] overflow-y-auto">
            {cities.map((city, i) => {
              const isCurrent = city.id === current;
              const isCurated = city.id in CITIES;
              return (
                <li key={city.id} className="flap-row" style={{ animationDelay: `${i * 45}ms` }}>
                  <VTLink
                    href={cityPath(city.id)}
                    onClick={() => closeBoard()}
                    aria-current={isCurrent ? "page" : undefined}
                    className={`pressable w-full px-4 py-3 flex items-baseline justify-between gap-3 text-left ${
                      isCurrent ? "bg-cream-edge" : "bg-cream hover:bg-cream-edge"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-black uppercase tracking-[-0.01em] text-lg leading-none text-ink">
                        {city.name}
                      </p>
                      <p className="font-serif italic text-xs mt-0.5 text-ink-soft">
                        {isCurated
                          ? CITIES[city.id].country
                          : `${city.count} station${city.count === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <span
                      className={`font-mono text-[10px] tracking-[0.22em] uppercase ${
                        isCurrent ? "text-express" : "text-ink-faint"
                      }`}
                    >
                      {isCurrent ? "Active" : "Live"}
                    </span>
                  </VTLink>
                </li>
              );
            })}

            {suggestions.length > 0 && (
              <li className="px-4 py-2 border-t border-ink/10">
                <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-faint">
                  Open a starter board
                </p>
              </li>
            )}
            {suggestions.map((slot) => (
              <li key={slot.id}>
                <VTLink
                  href={`${cityPath(slot.id)}?contribute=1`}
                  onClick={() => closeBoard()}
                  className="pressable w-full px-4 py-3 flex items-baseline justify-between gap-3 text-left bg-cream hover:bg-cream-edge"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-black uppercase tracking-[-0.01em] text-lg leading-none text-ink-soft">
                      {slot.name}
                    </p>
                    <p className="font-serif italic text-xs mt-0.5 text-ink-faint/70">
                      {slot.country} · no stations yet
                    </p>
                  </div>
                  <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-express">
                    Open →
                  </span>
                </VTLink>
              </li>
            ))}
          </ul>

          <div className="px-4 py-3 border-t border-ink/15 bg-cream-edge/40">
            <OpenCityForm onOpened={closeBoard} compact />
          </div>
        </div>
      )}
    </div>
  );
}
