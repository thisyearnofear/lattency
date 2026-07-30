"use client";

// LiveMap — client wrapper around MapShell that makes the network feel
// alive. It subscribes to Base44's realtime Measurement stream and, when a
// reading lands anywhere, refetches the network and flashes a "live board"
// stamp on the map — the same instant-feedback a transit departure board
// gives when a train arrives. Falls back gracefully: without Base44 it just
// renders the SSR cafés with no live updates and no concierge.

import { useCallback, useRef, useState } from "react";
import type { CafeStation, CityId } from "@/lib/types";
import type { CityConfig } from "@/lib/cities";
import { MapShell } from "./map-shell";
import { ConciergeChat } from "./concierge-chat";
import { useRealtimeMeasurements } from "@/hooks/use-realtime-cafes";

interface LiveMapProps {
  initialCafes: CafeStation[];
  city?: CityId;
  cityConfig?: CityConfig;
}

interface LastReading {
  name: string;
  down: number;
}

export function LiveMap({ initialCafes, city, cityConfig }: LiveMapProps) {
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
      {/* The realtime flash ticket now lives inside MapShell's bottom control
          rail (it replaces the resting live badge while a reading lands), so
          this wrapper no longer paints its own fixed ticket over the corner. */}
      <MapShell
        cafes={cafes}
        city={city}
        cityConfig={cityConfig}
        readingFlash={live && flash && Boolean(lastReading)}
        readingFlashText={
          lastReading
            ? `${lastReading.down} mbps logged · ${lastReading.name}`
            : ""
        }
      />

      <ConciergeChat />
    </>
  );
}
