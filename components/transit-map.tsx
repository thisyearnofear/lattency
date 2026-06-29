import type { CafeStation, Neighbourhood, Tier } from "@/lib/types";
import { assessStability, STABILITY_COLOUR } from "@/lib/stability";

const VIEW_W = 1440;
const VIEW_H = 720;

const COLUMN_CENTER: Record<Neighbourhood, number> = {
  Westlands: 255,
  Kilimani: 565,
  CBD: 875,
  Karen: 1185,
};
const COLUMN_ORDER: Neighbourhood[] = ["Westlands", "Kilimani", "CBD", "Karen"];
const COLUMN_DIVIDER_X = [410, 720, 1030]; // between W|K, K|C, C|Kn

const LINE_Y: Record<Tier, number> = {
  express: 220,
  local: 380,
  suspended: 540,
};
const LINE_X_START = 100;
const LINE_X_END = 1340;

const TIER_COLOUR: Record<Tier, string> = {
  express: "var(--color-express)",
  local: "var(--color-local)",
  suspended: "var(--color-suspended)",
};
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

type Position = { x: number; y: number };

function computePositions(cafes: CafeStation[]): Map<string, Position> {
  const positions = new Map<string, Position>();
  const buckets = new Map<string, CafeStation[]>();
  for (const c of cafes) {
    const key = `${c.tier}|${c.neighbourhood}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(c);
    else buckets.set(key, [c]);
  }
  for (const [key, group] of buckets) {
    const [tier, neighbourhood] = key.split("|") as [Tier, Neighbourhood];
    const cx = COLUMN_CENTER[neighbourhood];
    const y = LINE_Y[tier];
    group.sort((a, b) => a.name.localeCompare(b.name));
    if (group.length === 1) {
      positions.set(group[0].id, { x: cx, y });
    } else {
      const spread = 130;
      const start = cx - (spread * (group.length - 1)) / 2;
      group.forEach((c, i) => {
        positions.set(c.id, { x: start + i * spread, y });
      });
    }
  }
  return positions;
}

// Splits a name into 1 or 2 caps lines for display under a station roundel.
function splitName(name: string): [string, string?] {
  const upper = name.toUpperCase();
  const words = upper.split(" ");
  if (words.length <= 2 && upper.length <= 16) return [upper];
  const splitAt = words.length <= 3 ? 1 : 2;
  return [words.slice(0, splitAt).join(" "), words.slice(splitAt).join(" ")];
}

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

function TierBadge({ tier, y }: { tier: Tier; y: number }) {
  return (
    <g>
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
    </g>
  );
}

function TierThreshold({ tier, y }: { tier: Tier; y: number }) {
  return (
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
  );
}

export function TransitMap({ cafes }: { cafes: CafeStation[] }) {
  const positions = computePositions(cafes);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="transit-svg w-full h-auto"
      role="img"
      aria-label="Lattency Nairobi metro map of café wifi speeds"
    >
      {/* Inner page rules — faint vertical column dividers */}
      {COLUMN_DIVIDER_X.map((x) => (
        <line
          key={`div-${x}`}
          x1={x}
          y1={88}
          x2={x}
          y2={618}
          stroke="var(--color-cream-deep)"
          strokeWidth={1}
          strokeDasharray="2 6"
        />
      ))}

      {/* Neighbourhood column labels */}
      {COLUMN_ORDER.map((n) => (
        <g key={n}>
          <text
            x={COLUMN_CENTER[n]}
            y={66}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontWeight={500}
            fontSize={11}
            letterSpacing="0.32em"
            fill="var(--color-ink-soft)"
          >
            {n.toUpperCase()}
          </text>
          {/* Small index numeral above each column name. */}
          <text
            x={COLUMN_CENTER[n]}
            y={42}
            textAnchor="middle"
            fontFamily="var(--font-serif)"
            fontStyle="italic"
            fontSize={14}
            fill="var(--color-ink-faint)"
          >
            {String(COLUMN_ORDER.indexOf(n) + 1).padStart(2, "0")}
          </text>
        </g>
      ))}

      {/* Top hairline rule beneath the neighbourhood labels */}
      <line
        x1={100}
        y1={88}
        x2={1340}
        y2={88}
        stroke="var(--color-ink)"
        strokeWidth={1}
      />
      {/* Bottom hairline rule beneath the lines */}
      <line
        x1={100}
        y1={618}
        x2={1340}
        y2={618}
        stroke="var(--color-ink)"
        strokeWidth={1}
      />

      {/* Three line tracks */}
      <line
        className="line-track"
        x1={LINE_X_START}
        y1={LINE_Y.express}
        x2={LINE_X_END}
        y2={LINE_Y.express}
        stroke={TIER_COLOUR.express}
        strokeWidth={16}
        strokeLinecap="round"
      />
      <line
        className="line-track"
        style={{ animationDelay: "120ms" }}
        x1={LINE_X_START}
        y1={LINE_Y.local}
        x2={LINE_X_END}
        y2={LINE_Y.local}
        stroke={TIER_COLOUR.local}
        strokeWidth={16}
        strokeLinecap="round"
      />
      <line
        className="line-track is-suspended"
        style={{ animationDelay: "240ms" }}
        x1={LINE_X_START}
        y1={LINE_Y.suspended}
        x2={LINE_X_END}
        y2={LINE_Y.suspended}
        stroke={TIER_COLOUR.suspended}
        strokeWidth={14}
        strokeLinecap="butt"
        strokeDasharray="14 10"
      />

      {/* Tier badges + thresholds */}
      {(Object.keys(LINE_Y) as Tier[]).map((tier) => (
        <g key={tier}>
          <TierBadge tier={tier} y={LINE_Y[tier]} />
          <TierThreshold tier={tier} y={LINE_Y[tier]} />
        </g>
      ))}

      {/* Stations */}
      {cafes.map((cafe, i) => {
        const pos = positions.get(cafe.id);
        if (!pos) return null;
        const stroke =
          cafe.tier === "suspended"
            ? "var(--color-suspended-ink)"
            : "var(--color-ink)";
        const delay = 1200 + i * 55;
        return (
          <g
            key={cafe.id}
            className="station"
            style={{ animationDelay: `${delay}ms` }}
            data-cafe-id={cafe.id}
          >
            {/* Median Mbps above the roundel */}
            <text
              x={pos.x}
              y={pos.y - 22}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontWeight={600}
              fontSize={12}
              fill={TIER_COLOUR[cafe.tier]}
              letterSpacing="0.04em"
            >
              {Math.round(cafe.medianDownMbps)}
            </text>

            {/* The roundel itself — cream with ink outline, classic metro */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={12}
              fill="var(--color-cream)"
              stroke={stroke}
              strokeWidth={3}
            />

            {/* Stability ring — visible only when auto-test data exists */}
            {(() => {
              const s = assessStability(cafe.medianJitterMs, cafe.medianLossPct);
              if (!s.hasData) return null;
              return (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={16}
                  fill="none"
                  stroke={STABILITY_COLOUR[s.stability]}
                  strokeWidth={2}
                  opacity={0.7}
                />
              );
            })()}

            {/* Café name below */}
            <NameLabel name={cafe.name} x={pos.x} y={pos.y + 30} />
          </g>
        );
      })}

      {/* Edition stamp bottom-right */}
      <text
        x={1408}
        y={695}
        textAnchor="end"
        fontFamily="var(--font-mono)"
        fontSize={10}
        letterSpacing="0.22em"
        fill="var(--color-ink-faint)"
      >
        EDITION 01 · NAIROBI · 2026.06.29
      </text>
      <text
        x={100}
        y={695}
        textAnchor="start"
        fontFamily="var(--font-serif)"
        fontStyle="italic"
        fontSize={12}
        fill="var(--color-ink-faint)"
      >
        printed from live measurements
      </text>
    </svg>
  );
}
