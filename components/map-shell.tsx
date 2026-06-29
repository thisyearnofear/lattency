"use client";

// MapShell — the product-first home's map. Two modes, one toggle:
//
//   schematic    Static SVG with all 12 stations on three Bezier line tracks.
//                Renders immediately, no scroll, no cinematic timeline.
//   geographic   Real Leaflet basemap (CARTO Light tiles over OpenStreetMap),
//                stations as tier-coloured markers at actual lat/lng,
//                polylines connecting same-tier stations west-to-east.
//
// Click any station — schematic or geographic — opens the CafeDetail drawer.
// "Find me" locates the user; if they're far from Nairobi (judges anywhere
// in the world), it offers four demo neighbourhoods to explore from.

import { useState } from "react";
import dynamic from "next/dynamic";
import type { CafeStation, Tier } from "@/lib/types";
import {
  STATION_WAYPOINT,
  TIER_COLOUR,
  TIER_PATH,
  TIER_TINT,
  VIEW_H,
  VIEW_W,
  splitName,
} from "@/lib/map-data";
import { CafeDetail } from "./cafe-detail";

// Approximate centre of Nairobi for "how far away am I?" math.
const NAIROBI_CBD = { lat: -1.2864, lng: 36.8172 };
// If the geolocated position is further than this from Nairobi, we treat
// it as "demo from afar" and offer neighbourhood quick-picks.
const NEAR_NAIROBI_KM = 50;

const DEMO_LOCATIONS: Array<{ id: string; name: string; lat: number; lng: number }> = [
  { id: "westlands", name: "Westlands", lat: -1.262, lng: 36.806 },
  { id: "kilimani", name: "Kilimani", lat: -1.293, lng: 36.7891 },
  { id: "cbd", name: "CBD", lat: -1.285, lng: 36.8226 },
  { id: "karen", name: "Karen", lat: -1.331, lng: 36.7102 },
];

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
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

// Leaflet pulls in window; ssr: false keeps it client-only.
const MapLeaflet = dynamic(() => import("./map-leaflet"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[72vh] max-h-[640px] bg-cream-deep grid place-items-center">
      <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-ink-faint">
        loading map…
      </p>
    </div>
  ),
});

type ViewMode = "schematic" | "geographic";

const TIER_BADGE: Record<Tier, string> = {
  express: "X",
  local: "L",
  suspended: "S",
};
const TIER_THRESHOLD: Record<Tier, string> = {
  express: "≥ 50 MBPS",
  local: "10 – 49",
  suspended: "< 10",
};
const TIER_ORDER: Tier[] = ["express", "local", "suspended"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function NameLabel({ name, x, y }: { name: string; x: number; y: number }) {
  const [line1, line2] = splitName(name);
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontFamily="var(--font-display)"
      fontWeight={800}
      fontSize={13}
      letterSpacing="0.04em"
      fill="var(--color-ink)"
      style={{ pointerEvents: "none" }}
    >
      <tspan x={x}>{line1}</tspan>
      {line2 && (
        <tspan x={x} dy={14}>
          {line2}
        </tspan>
      )}
    </text>
  );
}

// ── Schematic (SVG) layer ────────────────────────────────────────────────────

function SchematicLayer({
  cafes,
  activeTiers,
  onSelect,
}: {
  cafes: CafeStation[];
  activeTiers: Set<Tier>;
  onSelect: (cafe: CafeStation) => void;
}) {
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full h-auto max-h-[72vh] bg-cream"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Schematic network — twelve stations across three speed tiers"
    >
      {/* Three line tracks — inactive tiers fade to a hint of themselves */}
      {TIER_ORDER.map((tier) => {
        const active = activeTiers.has(tier);
        return (
          <path
            key={tier}
            d={TIER_PATH[tier]}
            fill="none"
            stroke={TIER_COLOUR[tier]}
            strokeWidth={tier === "suspended" ? 14 : 16}
            strokeLinecap={tier === "suspended" ? "butt" : "round"}
            strokeLinejoin="round"
            strokeDasharray={tier === "suspended" ? "14 10" : undefined}
            opacity={active ? (tier === "suspended" ? 0.85 : 1) : 0.08}
            style={{ pointerEvents: "none", transition: "opacity 300ms" }}
          />
        );
      })}

      {/* Tier badges + thresholds — slightly faded when their tier is off */}
      {TIER_ORDER.map((tier, i) => {
        const y = 220 + i * 160;
        const active = activeTiers.has(tier);
        return (
          <g
            key={`badge-${tier}`}
            style={{
              pointerEvents: "none",
              opacity: active ? 1 : 0.3,
              transition: "opacity 300ms",
            }}
          >
            <rect
              x={36}
              y={y - 20}
              width={44}
              height={40}
              rx={6}
              fill={TIER_COLOUR[tier]}
            />
            <text
              x={58}
              y={y + 8}
              textAnchor="middle"
              fontFamily="var(--font-display)"
              fontWeight={900}
              fontSize={24}
              fill="var(--color-cream)"
            >
              {TIER_BADGE[tier]}
            </text>
            <text
              x={1408}
              y={y + 4}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              fontWeight={500}
              fontSize={11}
              letterSpacing="0.18em"
              fill="var(--color-ink-soft)"
            >
              {TIER_THRESHOLD[tier]}
            </text>
          </g>
        );
      })}

      {/* Stations — filtered out entirely when their tier is off */}
      {cafes.filter((c) => activeTiers.has(c.tier)).map((cafe) => {
        const pos = STATION_WAYPOINT[cafe.name];
        if (!pos) return null;
        const stroke =
          cafe.tier === "suspended"
            ? "var(--color-suspended-ink)"
            : "var(--color-ink)";
        const tint = TIER_TINT[cafe.tier];
        return (
          <g
            key={cafe.id}
            data-cafe-id={cafe.id}
            transform={`translate(${pos.x},${pos.y})`}
            onClick={() => onSelect(cafe)}
            role="button"
            tabIndex={0}
            aria-label={`Open ${cafe.name} details`}
            style={{ cursor: "pointer" }}
            className="group"
          >
            <circle r={26} fill="transparent" stroke="transparent" />
            <circle
              r={18}
              fill={tint}
              opacity={0}
              className="transition-opacity duration-200 group-hover:opacity-50"
            />
            <text
              x={0}
              y={-22}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontWeight={600}
              fontSize={12}
              fill={TIER_COLOUR[cafe.tier]}
              letterSpacing="0.04em"
              style={{ pointerEvents: "none" }}
            >
              {Math.round(cafe.medianDownMbps)}
            </text>
            <circle
              r={12}
              fill="var(--color-cream)"
              stroke={stroke}
              strokeWidth={3}
              className="transition-transform duration-200 group-hover:scale-110"
              style={{ transformOrigin: "0 0", transformBox: "fill-box" }}
            />
            <NameLabel name={cafe.name} x={0} y={30} />
          </g>
        );
      })}
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

type LocateStatus = "idle" | "pending" | "here" | "far" | "denied" | "unavailable";

export function MapShell({ cafes }: { cafes: CafeStation[] }) {
  const [view, setView] = useState<ViewMode>("schematic");
  const [selected, setSelected] = useState<CafeStation | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [locStatus, setLocStatus] = useState<LocateStatus>("idle");
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [activeTiers, setActiveTiers] = useState<Set<Tier>>(
    () => new Set(["express", "local", "suspended"]),
  );

  function toggleTier(tier: Tier) {
    setActiveTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }

  function showAllTiers() {
    setActiveTiers(new Set(["express", "local", "suspended"]));
  }

  const tierCounts = TIER_ORDER.reduce<Record<Tier, number>>(
    (acc, t) => {
      acc[t] = cafes.filter((c) => c.tier === t).length;
      return acc;
    },
    { express: 0, local: 0, suspended: 0 },
  );
  const allActive = activeTiers.size === 3;
  const noneActive = activeTiers.size === 0;

  function ensureGeographic() {
    if (view !== "geographic") setView("geographic");
  }

  function locateMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocStatus("unavailable");
      return;
    }
    setLocStatus("pending");
    ensureGeographic();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const d = haversineKm(here, NAIROBI_CBD);
        setDistanceKm(d);
        if (d > NEAR_NAIROBI_KM) {
          setLocStatus("far");
          setFocus({ ...here, label: `You · ${Math.round(d).toLocaleString()} km away` });
        } else {
          setLocStatus("here");
          setFocus({ ...here, label: "You are here" });
        }
      },
      () => setLocStatus("denied"),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  function jumpTo(neighbourhood: (typeof DEMO_LOCATIONS)[number]) {
    ensureGeographic();
    setFocus({
      lat: neighbourhood.lat,
      lng: neighbourhood.lng,
      label: `Demo · ${neighbourhood.name}`,
    });
    setLocStatus("here");
  }

  // Whether to surface the neighbourhood demo quick-picks. Show them when:
  //  - user is idle (haven't tried yet) — gentle prompt
  //  - user is far from Nairobi — meaningful fallback
  //  - permission denied / unavailable — only option
  const showDemoPicks =
    locStatus === "idle" || locStatus === "far" || locStatus === "denied" || locStatus === "unavailable";

  const locateLabel: Record<LocateStatus, string> = {
    idle: "Find me",
    pending: "Locating…",
    here: "Located",
    far: "You're far · pick a spot",
    denied: "Permission denied",
    unavailable: "Geolocation unavailable",
  };

  return (
    <div className="relative w-full">
      {/* Tier filter chips — above the map. Click any to toggle, "All" resets. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={showAllTiers}
          aria-pressed={allActive}
          className={`px-3 py-1.5 font-mono text-[10px] tracking-[0.22em] uppercase border transition-colors ${
            allActive
              ? "bg-ink text-cream border-ink"
              : "bg-cream text-ink-soft border-ink/30 hover:border-ink hover:text-ink"
          }`}
        >
          All lines
        </button>
        {TIER_ORDER.map((tier) => {
          const active = activeTiers.has(tier);
          const bg =
            tier === "express"
              ? "bg-express"
              : tier === "local"
              ? "bg-local"
              : "bg-suspended";
          return (
            <button
              key={tier}
              type="button"
              onClick={() => toggleTier(tier)}
              aria-pressed={active}
              className={`pl-2 pr-3 py-1.5 inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase border transition-all ${
                active
                  ? "bg-cream text-ink border-ink"
                  : "bg-cream/60 text-ink-faint border-ink/15 hover:border-ink/40"
              }`}
            >
              <span
                className={`${bg} ${active ? "" : "opacity-30"} w-5 h-5 inline-flex items-center justify-center text-cream font-display font-black text-[12px]`}
              >
                {TIER_BADGE[tier]}
              </span>
              <span>{tier}</span>
              <span className={active ? "text-ink-faint" : "text-ink-faint/60"}>
                {tierCounts[tier]}
              </span>
            </button>
          );
        })}
      </div>

      {view === "schematic" ? (
        <SchematicLayer
          cafes={cafes}
          activeTiers={activeTiers}
          onSelect={setSelected}
        />
      ) : (
        <MapLeaflet
          cafes={cafes}
          onSelectStation={setSelected}
          focusOn={focus}
          activeTiers={activeTiers}
        />
      )}

      {noneActive && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none z-[400]">
          <p className="bg-cream border border-ink/80 px-4 py-2 font-mono text-[10px] tracking-[0.22em] uppercase text-ink-soft shadow-[3px_4px_0_0_var(--color-ink)]">
            All tiers hidden — click a chip to show stations
          </p>
        </div>
      )}

      {/* Locate panel — top-right of the map */}
      <div className="absolute top-3 right-3 md:top-4 md:right-4 z-[500] pointer-events-auto max-w-[260px] md:max-w-[300px]">
        <div className="bg-cream/95 border border-ink/80 shadow-[4px_5px_0_0_var(--color-ink)] font-mono text-[10px] tracking-[0.2em] uppercase">
          <button
            type="button"
            onClick={locateMe}
            disabled={locStatus === "pending"}
            className="w-full px-3 py-2 flex items-center justify-between gap-3 bg-ink text-cream hover:bg-ink-soft disabled:opacity-60 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden>◎</span>
              {locateLabel[locStatus]}
            </span>
            {distanceKm !== null && locStatus !== "pending" && (
              <span className="text-cream/70">
                {distanceKm < 1
                  ? "<1 km"
                  : `${Math.round(distanceKm).toLocaleString()} km`}
              </span>
            )}
          </button>

          {showDemoPicks && (
            <div className="px-3 py-2 border-t border-ink/20">
              <p className="text-ink-faint mb-1.5 tracking-[0.18em]">
                {locStatus === "far"
                  ? "Demo from a Nairobi neighbourhood"
                  : locStatus === "denied" || locStatus === "unavailable"
                  ? "Pick a demo spot"
                  : "Or jump in"}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {DEMO_LOCATIONS.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => jumpTo(n)}
                    className="px-2 py-1.5 text-left text-ink-soft hover:text-ink hover:bg-cream-edge transition-colors border border-ink/15 normal-case tracking-normal font-mono text-[10px]"
                  >
                    {n.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View toggle — bottom-left */}
      <div className="absolute bottom-4 left-4 z-[500] pointer-events-auto">
        <div
          role="tablist"
          aria-label="Map view"
          className="flex items-center gap-1 bg-cream/95 border border-ink/80 p-1 font-mono text-[10px] tracking-[0.2em] uppercase shadow-sm"
        >
          {(["schematic", "geographic"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={view === mode}
              onClick={() => setView(mode)}
              className={`px-2.5 py-1.5 transition-colors ${
                view === mode
                  ? "bg-ink text-cream"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Tap-target hint, bottom-right */}
      <p
        aria-hidden
        className="absolute bottom-4 right-4 z-[500] font-mono text-[9px] tracking-[0.24em] uppercase text-ink-faint pointer-events-none"
      >
        {view === "schematic" ? "tap any station →" : "tap any pin →"}
      </p>

      <CafeDetail station={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
