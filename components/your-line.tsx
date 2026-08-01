"use client";

// YourLine — renders the contributor's personal trail as a transit line.
// Each mapped station appears as a tier-coloured node connected by a dashed
// ink line, in the same SVG style as the schematic map. Used in the
// celebration overlay and on the /me page. The data comes from the
// usePersonalTrail hook (localStorage, keyed by city).

import { useMemo } from "react";
import type { Tier } from "@/lib/types";
import { TIER_COLOUR } from "@/lib/map-data";

const TIER_TINT: Record<Tier, string> = {
  express: "#9FC7B5",
  local: "#E8C98A",
  suspended: "#DDA0A4",
};

export interface TrailStation {
  name: string;
  tier: Tier;
  city: string;
}

export function YourLine({
  stations,
  title = "Your line",
}: {
  stations: TrailStation[];
  title?: string;
}) {
  const layout = useMemo(() => {
    if (stations.length === 0) return null;
    const n = stations.length;
    const padding = 60;
    const width = 560;
    const height = 160;
    const usableW = width - padding * 2;
    const spacing = n > 1 ? usableW / (n - 1) : 0;

    return stations.map((station, i) => ({
      ...station,
      x: padding + (n > 1 ? i * spacing : usableW / 2),
      y: height / 2,
    }));
  }, [stations]);

  if (!layout || layout.length === 0) {
    return (
      <div className="border border-dashed border-ink/25 bg-cream-edge/40 p-6 text-center">
        <p className="font-serif italic text-ink-soft text-sm">
          Map your first café to start your line.
        </p>
      </div>
    );
  }

  const width = 560;
  const height = 160;

  // Build the connecting path
  let pathD = "";
  if (layout.length >= 2) {
    pathD = `M ${layout[0].x} ${layout[0].y}`;
    for (let i = 1; i < layout.length; i++) {
      const prev = layout[i - 1];
      const curr = layout[i];
      const cx = (prev.x + curr.x) / 2;
      pathD += ` Q ${prev.x} ${prev.y}, ${cx} ${(prev.y + curr.y) / 2}`;
    }
    pathD += ` T ${layout[layout.length - 1].x} ${layout[layout.length - 1].y}`;
  }

  return (
    <div>
      {title && <p className="stamp mb-3">{title}</p>}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Your transit line — ${stations.length} stations mapped`}
      >
        {/* Connecting line */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth={3}
            strokeDasharray="2 6"
            strokeLinecap="round"
            opacity={0.55}
          />
        )}

        {/* Stations */}
        {layout.map((station, i) => {
          const colour = TIER_COLOUR[station.tier] ?? TIER_COLOUR.express;
          const tint = TIER_TINT[station.tier] ?? TIER_TINT.express;
          return (
            <g key={i} transform={`translate(${station.x},${station.y})`}>
              {/* Hover/touch area */}
              <circle r={26} fill="transparent" stroke="transparent" />
              {/* Tint background */}
              <circle r={18} fill={tint} opacity={0.3} />
              {/* Station circle */}
              <circle
                r={12}
                fill="var(--color-cream)"
                stroke={colour}
                strokeWidth={3}
              />
              {/* Speed/tier glyph */}
              <text
                x={0}
                y={-22}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontWeight={600}
                fontSize={11}
                fill={colour}
                style={{ pointerEvents: "none" }}
              >
                {station.tier[0].toUpperCase()}
              </text>
              {/* Station name */}
              <text
                x={0}
                y={30}
                textAnchor="middle"
                fontFamily="var(--font-display)"
                fontWeight={800}
                fontSize={10}
                fill="var(--color-ink)"
                style={{ pointerEvents: "none" }}
              >
                {station.name.length > 18
                  ? station.name.slice(0, 16) + "…"
                  : station.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
