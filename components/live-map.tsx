"use client";

// LiveMap — client wrapper around MapShell that makes the network feel
// alive. It subscribes to Base44's realtime Measurement stream and, when a
// reading lands anywhere, refetches the network and flashes a "live board"
// stamp on the map — the same instant-feedback a transit departure board
// gives when a train arrives. Falls back gracefully: without Base44 it just
// renders the SSR cafés with no live updates and no concierge.

import { useCallback, useRef, useState } from "react";
import type { CafeStation, CityId } from "@/lib/types";
import { MapShell } from "./map-shell";
import { ConciergeChat } from "./concierge-chat";
import { useRealtimeMeasurements } from "@/hooks/use-realtime-cafes";

interface LiveMapProps {
  initialCafes: CafeStation[];
  city?: CityId;
}

interface LastReading {
  name: string;
  down: number;
}

export function LiveMap({ initialCafes, city }: LiveMapProps) {
  const [cafes, setCafes] = useState<CafeStation[]>(initialCafes);
  const [flash, setFlash] = useState(false);
  const [lastReading, setLastReading] = useState<LastReading | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (city) params.set("city", city);
      const res = await fetch(`/api/cafes/near?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { cafes: CafeStation[] };
      if (data.cafes?.length) setCafes(data.cafes);
    } catch {
      // Keep the last good snapshot on transient errors.
    }
  }, [city]);

  const live = useRealtimeMeasurements((reading) => {
    void refetch();
    // Resolve the venue name from the current snapshot for the flash.
    const cafe = cafes.find((c) => c.id === reading.cafe_id);
    setLastReading({
      name: cafe?.name ?? "A station",
      down: Math.round(reading.down_mbps),
    });
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 2200);
  });

  return (
    <>
      <div className="relative">
        <MapShell cafes={cafes} city={city} />

        {/* Live-board stamp — sits on the map's bottom-left corner. */}
        {live && (
          <div
            className="pointer-events-none absolute bottom-3 left-3 z-[450]"
            aria-live="polite"
          >
            <div
              className={`inline-flex items-center gap-2.5 border px-3 py-2 shadow-[3px_4px_0_0_var(--color-ink)] transition-all duration-300 ${
                flash
                  ? "border-express bg-express text-cream"
                  : "border-ink/80 bg-cream/95 text-ink-soft"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  flash ? "bg-cream" : "bg-express animate-pulse"
                }`}
                aria-hidden
              />
              {flash && lastReading ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.18em]">
                  {lastReading.down} mbps logged · {lastReading.name}
                </span>
              ) : (
                <span className="font-mono text-[9px] uppercase tracking-[0.18em]">
                  live · listening for readings
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <ConciergeChat />
    </>
  );
}
