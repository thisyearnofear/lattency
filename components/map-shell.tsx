"use client";

// MapShell — the product-first home's map. Static, no scroll-driven
// cinematic, no GSAP timeline. Shows all 12 stations + three line tracks
// in their final state from t=0. Toggle between schematic and geographic
// without re-mounting; stations morph their position via CSS transitions.
// Click a station → existing CafeDetail drawer.

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { CafeStation, Tier } from "@/lib/types";
import {
  HOODS,
  STATION_WAYPOINT,
  TIER_COLOUR,
  TIER_PATH,
  TIER_TINT,
  VIEW_H,
  VIEW_W,
  projectLatLng,
  splitName,
} from "@/lib/map-data";
import { CafeDetail } from "./cafe-detail";

gsap.registerPlugin(useGSAP);

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

// ── Component ────────────────────────────────────────────────────────────────

export function MapShell({ cafes }: { cafes: CafeStation[] }) {
  const scope = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewMode>("schematic");
  const [selected, setSelected] = useState<CafeStation | null>(null);

  // Pre-compute both layouts once. Schematic positions come from waypoints
  // keyed by name; geographic positions are projected at runtime.
  const layouts = useMemo(() => {
    const schematic = new Map<string, { x: number; y: number }>();
    const geographic = new Map<string, { x: number; y: number }>();
    for (const cafe of cafes) {
      const wp = STATION_WAYPOINT[cafe.name];
      if (wp) schematic.set(cafe.id, { x: wp.x, y: wp.y });
      geographic.set(cafe.id, projectLatLng(cafe.lat, cafe.lng));
    }
    return { schematic, geographic };
  }, [cafes]);

  // Morph station positions + path opacity when the view toggles.
  useGSAP(
    () => {
      if (!scope.current) return;
      const positions = view === "schematic" ? layouts.schematic : layouts.geographic;
      const ease = "power3.inOut";
      const duration = 0.9;

      for (const cafe of cafes) {
        const target = positions.get(cafe.id);
        if (!target) continue;
        gsap.to(`.ms-station[data-cafe-id="${cafe.id}"]`, {
          x: target.x,
          y: target.y,
          duration,
          ease,
        });
      }

      // In geographic mode, line tracks become misleading (stations no longer
      // sit on the schematic Bezier paths), so fade them out and surface the
      // neighbourhood polygons instead.
      const linesOpacity = view === "schematic" ? 1 : 0.08;
      const hoodsOpacity = view === "schematic" ? 0 : 1;
      gsap.to(".ms-line", { opacity: linesOpacity, duration: 0.6 });
      gsap.to(".ms-hood-shape", { opacity: hoodsOpacity * 0.6, duration: 0.6 });
      gsap.to(".ms-hood-label", { opacity: hoodsOpacity, duration: 0.6 });
    },
    { scope, dependencies: [view, cafes, layouts] },
  );

  // Initial paint — make sure stations are positioned correctly on first
  // render before useGSAP runs.
  useEffect(() => {
    if (!scope.current) return;
    const positions = view === "schematic" ? layouts.schematic : layouts.geographic;
    const groups = scope.current.querySelectorAll<SVGGElement>(".ms-station");
    groups.forEach((g) => {
      const id = g.dataset.cafeId;
      if (!id) return;
      const pos = positions.get(id);
      if (!pos) return;
      g.setAttribute("transform", `translate(${pos.x},${pos.y})`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full">
      <svg
        ref={scope}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto max-h-[72vh] bg-cream"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Map of Nairobi café wifi network — twelve stations across three speed tiers"
      >
        {/* Neighbourhood polygons — visible in geographic mode */}
        {HOODS.map((hood) => (
          <g key={hood.id}>
            <path
              className="ms-hood-shape"
              d={hood.d}
              fill="var(--color-cream-deep)"
              stroke="var(--color-cream-edge)"
              strokeWidth={1.5}
              style={{ opacity: 0, pointerEvents: "none" }}
            />
            <text
              className="ms-hood-label"
              x={hood.anchor.x}
              y={hood.anchor.y}
              textAnchor="start"
              fontFamily="var(--font-mono)"
              fontWeight={500}
              fontSize={11}
              letterSpacing="0.28em"
              fill="var(--color-ink-soft)"
              style={{ opacity: 0, pointerEvents: "none" }}
            >
              {hood.ordinal} · {hood.label}
            </text>
          </g>
        ))}

        {/* Three line tracks */}
        {TIER_ORDER.map((tier) => (
          <path
            key={tier}
            className="ms-line"
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
          const initial = layouts.schematic.get(cafe.id) ?? layouts.geographic.get(cafe.id);
          if (!initial) return null;
          const stroke =
            cafe.tier === "suspended"
              ? "var(--color-suspended-ink)"
              : "var(--color-ink)";
          const tint = TIER_TINT[cafe.tier];
          return (
            <g
              key={cafe.id}
              className="ms-station group"
              data-cafe-id={cafe.id}
              transform={`translate(${initial.x},${initial.y})`}
              onClick={() => setSelected(cafe)}
              role="button"
              tabIndex={0}
              aria-label={`Open ${cafe.name} details`}
              style={{ cursor: "pointer" }}
            >
              {/* Larger invisible hit area */}
              <circle
                r={26}
                fill="transparent"
                stroke="transparent"
              />
              {/* Soft halo on hover */}
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

      {/* View toggle — bottom-left */}
      <div className="absolute bottom-4 left-4 z-10">
        <div
          role="tablist"
          aria-label="Map view"
          className="flex items-center gap-1 bg-cream/95 border border-ink/80 p-1 font-mono text-[10px] tracking-[0.2em] uppercase"
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
        className="absolute bottom-4 right-4 z-10 font-mono text-[9px] tracking-[0.24em] uppercase text-ink-faint pointer-events-none"
      >
        tap any station →
      </p>

      <CafeDetail station={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
