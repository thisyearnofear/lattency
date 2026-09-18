"use client";

// If the visitor is far from every curated board, nudge them to open
// their own city instead of staring at London empty-handed.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CITIES, CITY_ORDER, cityPath } from "@/lib/cities";
import { haversineKm } from "@/lib/geo";

/** Rough "you're not near any live board" threshold. */
const FAR_KM = 80;

type NearHint =
  | { kind: "near"; cityId: string; cityName: string; km: number }
  | { kind: "far" }
  | null;

export function NearYouCityNudge({ currentCity }: { currentCity: string }) {
  const [hint, setHint] = useState<NearHint>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem("lattency:near-nudge-dismissed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (dismissed) return;
    if (typeof window === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let best: { id: string; name: string; km: number } | null = null;
        for (const id of CITY_ORDER) {
          const c = CITIES[id];
          const km = haversineKm(lat, lng, c.centre.lat, c.centre.lng);
          if (!best || km < best.km) {
            best = { id, name: c.name, km };
          }
        }
        if (best && best.km <= FAR_KM) {
          if (best.id !== currentCity) {
            setHint({ kind: "near", cityId: best.id, cityName: best.name, km: best.km });
          }
        } else {
          setHint({ kind: "far" });
        }
      },
      () => {
        /* permission denied — stay quiet */
      },
      { enableHighAccuracy: false, maximumAge: 600_000, timeout: 8_000 },
    );
  }, [currentCity, dismissed]);

  if (dismissed || !hint) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem("lattency:near-nudge-dismissed", "1");
    } catch {
      /* ignore */
    }
  }

  if (hint.kind === "near") {
    return (
      <div className="mt-3 border border-ink/25 bg-cream px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="font-serif italic text-sm text-ink-soft">
          Looks like you&rsquo;re near{" "}
          <span className="text-ink not-italic font-display font-black uppercase tracking-tight">
            {hint.cityName}
          </span>{" "}
          ({Math.round(hint.km)} km).
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={cityPath(hint.cityId)}
            className="font-mono text-[10px] tracking-[0.2em] uppercase text-express hover:text-ink"
          >
            Switch →
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint hover:text-ink"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border border-dashed border-ink/40 bg-cream-edge/50 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="stamp">Not in a live city?</p>
          <p className="font-serif italic text-sm text-ink-soft mt-1">
            You&rsquo;re outside London, Nairobi, and SF. Open your own board —
            the first verified reading draws the line.
          </p>
          <Link
            href="#open-city"
            className="inline-block font-mono text-[10px] tracking-[0.2em] uppercase text-express hover:text-ink mt-2"
          >
            Map my city →
          </Link>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint hover:text-ink shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
