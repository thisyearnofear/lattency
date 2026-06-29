"use client";

import { useMemo, useState } from "react";
import type { CafeStation, CityId, Tier } from "@/lib/types";
import { CITIES } from "@/lib/cities";
import { CafeDetail } from "./cafe-detail";

const TIER_BG: Record<Tier, string> = {
  express: "bg-express",
  local: "bg-local",
  suspended: "bg-suspended",
};
const TIER_LABEL: Record<Tier, string> = {
  express: "X · EXPRESS",
  local: "L · LOCAL",
  suspended: "S · SUSPENDED",
};

// Each city brings its own "start from the centre" demo origin via CITIES.

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(the|of|a)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fmtDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function StationCard({
  cafe,
  index,
  distance,
  onOpen,
}: {
  cafe: CafeStation;
  index: number;
  distance?: number;
  onOpen: () => void;
}) {
  const ord = String(index + 1).padStart(2, "0");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="station-card group relative block w-full text-left bg-cream border border-ink/15 hover:border-ink/60 hover:-translate-y-1 hover:shadow-[6px_8px_0_0_var(--color-ink)] focus-visible:border-ink focus-visible:shadow-[6px_8px_0_0_var(--color-ink)] outline-none transition-[transform,border-color,box-shadow] duration-300"
      style={{ animationDelay: `${Math.min(index * 90, 720)}ms` }}
    >
      <div className="relative aspect-[5/3] overflow-hidden bg-cream-edge">
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display font-black text-[88px] leading-none text-ink-faint/30 select-none">
            {initials(cafe.name)}
          </span>
        </div>
        <div className={`absolute inset-y-0 left-0 w-1 ${TIER_BG[cafe.tier]}`} />

        {cafe.latestPhotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cafe.latestPhotoUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover grayscale-[40%] contrast-[1.05] group-hover:grayscale-0 transition-[filter] duration-500"
          />
        )}

        <div
          className={`${TIER_BG[cafe.tier]} absolute top-0 right-0 px-3 py-1.5 text-cream font-mono text-[10px] tracking-[0.2em] uppercase`}
        >
          {TIER_LABEL[cafe.tier]}
        </div>

        {distance !== undefined && (
          <div className="absolute top-0 left-2 mt-2 bg-ink/90 px-2 py-1 text-cream font-mono text-[10px] tracking-[0.16em] uppercase tabular-nums">
            {fmtDistance(distance)}
          </div>
        )}

        <div className="absolute bottom-0 left-0 px-3 pb-1 pt-2 bg-cream/95 font-display font-black text-4xl leading-none text-ink">
          {ord}
        </div>
      </div>

      <div className="p-5 space-y-3">
        <h3 className="font-display font-black uppercase leading-[0.95] text-[26px] tracking-[-0.01em] text-ink">
          {cafe.name}
        </h3>

        <div className="flex items-baseline justify-between gap-3">
          <p className="font-serif italic text-ink-faint text-base">{cafe.neighbourhood}</p>
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft">
            {cafe.vibe}
          </p>
        </div>

        <div className="pt-3 border-t border-cream-deep grid grid-cols-3 gap-2 font-mono text-[11px] text-ink-soft">
          {[
            { l: "Down", v: Math.round(cafe.medianDownMbps), u: "Mbps" },
            { l: "Up", v: cafe.medianUpMbps.toFixed(1), u: "Mbps" },
            { l: "Ping", v: Math.round(cafe.medianLatencyMs), u: "ms" },
          ].map((s) => (
            <div key={s.l}>
              <div className="text-[9px] tracking-[0.2em] uppercase text-ink-faint">{s.l}</div>
              <div className="text-base text-ink font-medium tabular-nums">
                {s.v}
                <span className="text-[10px] text-ink-faint ml-1">{s.u}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink-faint group-hover:text-ink transition-colors">
          {cafe.measurementCount > 0
            ? `${cafe.measurementCount} measurements · open station →`
            : "Tier estimated · be the first to log a reading →"}
        </p>
      </div>
    </button>
  );
}

type GeoState =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "located"; origin: { lat: number; lng: number }; label: string }
  | { kind: "error"; message: string };

const FILTERS: Array<{ key: Tier | "all"; label: string }> = [
  { key: "all", label: "All lines" },
  { key: "express", label: "Express" },
  { key: "local", label: "Local" },
  { key: "suspended", label: "Suspended" },
];

export function StationDirectory({
  cafes,
  city = "nairobi",
}: {
  cafes: CafeStation[];
  city?: CityId;
}) {
  const cityConfig = CITIES[city];
  const [selected, setSelected] = useState<CafeStation | null>(null);
  const [filter, setFilter] = useState<Tier | "all">("all");
  const [geo, setGeo] = useState<GeoState>({ kind: "idle" });

  const origin = geo.kind === "located" ? geo.origin : null;

  // Distance map (client-side haversine, for the badge + sort). The server
  // /api/cafes/near proves the PostGIS ST_DWithin path; this is just for labels.
  const withDistance = useMemo(() => {
    return cafes.map((c) => ({
      cafe: c,
      distance: origin ? distanceKm(origin, c) : undefined,
    }));
  }, [cafes, origin]);

  const visible = useMemo(() => {
    let list = withDistance;
    if (filter !== "all") list = list.filter((x) => x.cafe.tier === filter);
    if (origin) {
      list = [...list].sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    }
    return list;
  }, [withDistance, filter, origin]);

  // Nearest café on the Express line — the headline answer to "where do I work?"
  const nearestExpress = useMemo(() => {
    if (!origin) return null;
    return withDistance
      .filter((x) => x.cafe.tier === "express")
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))[0];
  }, [withDistance, origin]);

  function locate(origin: { lat: number; lng: number }, label: string) {
    setGeo({ kind: "located", origin, label });
    // Fire the real ST_DWithin endpoint too — keeps the geo query path warm
    // and demonstrable, even though we render from the props we already have.
    void fetch(
      `/api/cafes/near?lat=${origin.lat}&lng=${origin.lng}&radius=100000`,
    ).catch(() => {});
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeo({ kind: "error", message: "Location isn't available in this browser." });
      return;
    }
    setGeo({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => locate({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "your location"),
      () =>
        setGeo({
          kind: "error",
          message: `Couldn't read your location — try the ${cityConfig.name} pin.`,
        }),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <section className="mt-24 pt-10 border-t border-ink/80">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <p className="stamp">Section II</p>
          <h2 className="font-display font-black uppercase text-5xl md:text-6xl tracking-[-0.02em] text-ink mt-1">
            Find your line
          </h2>
        </div>
        <p className="font-serif italic text-ink-faint hidden md:block">
          twelve stations · tap any to ride it
        </p>
      </div>

      {/* Finder + filter controls */}
      <div className="flex flex-col gap-4 mb-8 pb-6 border-b border-cream-deep">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={useMyLocation}
            className="bg-ink text-cream font-mono text-[11px] tracking-[0.2em] uppercase px-4 py-2.5 hover:bg-ink-soft transition-colors"
          >
            {geo.kind === "locating" ? "Locating…" : "◎ Find cafés near me"}
          </button>
          <button
            type="button"
            onClick={() => locate(cityConfig.centre, `${cityConfig.name} centre`)}
            className="font-mono text-[11px] tracking-[0.2em] uppercase px-4 py-2.5 border border-ink/40 text-ink-soft hover:border-ink hover:text-ink transition-colors"
          >
            ☕ Start from {cityConfig.name}
          </button>
          {origin && (
            <button
              type="button"
              onClick={() => setGeo({ kind: "idle" })}
              className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint underline underline-offset-4 hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>

        {geo.kind === "error" && (
          <p className="font-serif italic text-suspended text-sm">{geo.message}</p>
        )}

        {origin && nearestExpress && (
          <div className="flex items-center gap-3 bg-express/5 border border-express/30 px-4 py-3">
            <span className="bg-express text-cream font-display font-black text-2xl w-10 h-12 flex items-center justify-center shrink-0">
              X
            </span>
            <div>
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-soft">
                Nearest express line from {geo.kind === "located" ? geo.label : ""}
              </p>
              <p className="font-display font-black uppercase text-2xl text-ink leading-none mt-0.5">
                {nearestExpress.cafe.name}
                <span className="font-mono text-sm text-express ml-2 tracking-normal normal-case">
                  {nearestExpress.distance !== undefined
                    ? fmtDistance(nearestExpress.distance)
                    : ""}{" "}
                  · {Math.round(nearestExpress.cafe.medianDownMbps)} Mbps
                </span>
              </p>
            </div>
          </div>
        )}

        {/* Tier filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`font-mono text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 border transition-colors ${
                filter === f.key
                  ? "bg-ink text-cream border-ink"
                  : "border-ink/25 text-ink-soft hover:border-ink/60"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint ml-auto tabular-nums">
            {visible.length} shown
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-10">
        {visible.map(({ cafe, distance }, i) => (
          <StationCard
            key={cafe.id}
            cafe={cafe}
            index={i}
            distance={distance}
            onOpen={() => setSelected(cafe)}
          />
        ))}
      </div>

      <CafeDetail station={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
