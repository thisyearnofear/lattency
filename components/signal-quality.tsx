"use client";

import { assessStability, STABILITY_COLOUR } from "@/lib/stability";

// Signal-quality indicator — a compact bar that surfaces jitter and packet
// loss alongside the bandwidth tier. Shared across StationCard, CafeDetail,
// and CafePage so the visual language is identical everywhere (DRY).
//
// Three vertical signal bars encode the stability rating:
//   ●●● stable   ●●○ variable   ●○○ unstable
// When there's no auto-test data, the bars are dimmed and the label reads
// "No signal data" with a prompt to run the speed test.

export function SignalQuality({
  jitterMs,
  lossPct,
  /** Compact mode for station cards (no description line). */
  compact = false,
}: {
  jitterMs: number;
  lossPct: number;
  compact?: boolean;
}) {
  const { stability, hasData, label, description } = assessStability(jitterMs, lossPct);
  const colour = STABILITY_COLOUR[stability];

  // Number of filled bars: 3 stable, 2 variable, 1 unstable, 0 no data.
  const filled = hasData
    ? stability === "stable"
      ? 3
      : stability === "variable"
        ? 2
        : 1
    : 0;

  return (
    <div className={compact ? "" : "flex items-start justify-between gap-3"}>
      <div>
        <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-faint">
          Signal
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          {/* Signal bars — three vertical bars of increasing height */}
          <div className="flex items-end gap-[2px] h-3.5">
            {[1, 2, 3].map((bar) => (
              <div
                key={bar}
                className="w-[3px] transition-colors"
                style={{
                  height: `${bar * 33 + 33}%`,
                  background: bar <= filled ? colour : "var(--color-ink-faint)",
                  opacity: bar <= filled ? 0.9 : 0.2,
                }}
              />
            ))}
          </div>
          <span
            className="font-mono text-[10px] tracking-[0.15em] uppercase tabular-nums"
            style={{ color: hasData ? colour : "var(--color-ink-faint)" }}
          >
            {label}
          </span>
        </div>
        {hasData && (
          <p className="font-mono text-[9px] text-ink-faint tabular-nums mt-0.5">
            {jitterMs.toFixed(1)} ms jitter · {lossPct.toFixed(1)}% loss
          </p>
        )}
      </div>

      {!compact && hasData && (
        <p className="font-serif italic text-ink-faint text-xs text-right max-w-[140px]">
          {description}
        </p>
      )}
    </div>
  );
}
