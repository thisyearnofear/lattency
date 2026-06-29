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
  onSelect,
}: {
  cafes: CafeStation[];
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
      {/* Three line tracks */}
      {TIER_ORDER.map((tier) => (
        <path
          key={tier}
          d={TIER_PATH[tier]}
          fill="none"
          stroke={TIER_COLOUR[tier]}
          strokeWidth={tier === "suspended" ? 14 : 16}
          strokeLinecap={tier === "suspended" ? "butt" : "round"}
          strokeLinejoin="round"
          strokeDasharray={tier === "suspended" ? "14 10" : undefined}
          opacity={tier === "suspended" ? 0.85 : 1}
          style={{ pointerEvents: "none" }}
        />
      ))}

      {/* Tier badges + thresholds */}
      {TIER_ORDER.map((tier, i) => {
        const y = 220 + i * 160;
        return (
          <g key={`badge-${tier}`} style={{ pointerEvents: "none" }}>
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

      {/* Stations */}
      {cafes.map((cafe) => {
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

export function MapShell({ cafes }: { cafes: CafeStation[] }) {
  const [view, setView] = useState<ViewMode>("schematic");
  const [selected, setSelected] = useState<CafeStation | null>(null);

  return (
    <div className="relative w-full">
      {view === "schematic" ? (
        <SchematicLayer cafes={cafes} onSelect={setSelected} />
      ) : (
        <MapLeaflet cafes={cafes} onSelectStation={setSelected} />
      )}

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
