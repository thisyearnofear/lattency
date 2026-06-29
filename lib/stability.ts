// Stability rating — the "signal quality" axis that bandwidth-only tiers miss.
//
// A café can be "express" on throughput (≥ 50 Mbps) and still hostile to
// video calls because of high jitter or packet loss. This module derives a
// stability rating from jitter_ms and loss_pct, giving the UI a second
// dimension alongside the bandwidth tier.
//
// Thresholds are based on what matters for real work:
//   stable   — jitter < 10ms AND loss < 1%   → fine for calls, gaming, SSH
//   variable — jitter 10–30ms OR loss 1–3%   → okay for browsing, risky for calls
//   unstable — jitter > 30ms OR loss > 3%    → buffering, dropped calls
//
// When jitter and loss are both 0, there's no auto-test data yet (the MV
// COALESCEs to 0). Any real auto-test produces at least sub-millisecond
// jitter from HTTP overhead, so 0 is a reliable "no data" signal.

export type Stability = "stable" | "variable" | "unstable";

export interface StabilityResult {
  stability: Stability;
  /** True when no auto-test readings exist (jitter=0 AND loss=0). */
  hasData: boolean;
  /** Short label for the indicator. */
  label: string;
  /** One-line description of what this rating means for the user. */
  description: string;
}

export function assessStability(
  jitterMs: number,
  lossPct: number,
): StabilityResult {
  const hasData = jitterMs > 0 || lossPct > 0;

  if (!hasData) {
    return {
      stability: "stable",
      hasData: false,
      label: "No signal data",
      description: "Run the speed test to measure jitter and packet loss.",
    };
  }

  const stable = jitterMs < 10 && lossPct < 1;
  const variable = jitterMs < 30 && lossPct < 3;

  if (stable) {
    return {
      stability: "stable",
      hasData: true,
      label: "Stable",
      description: "Fine for video calls, gaming, and SSH.",
    };
  }

  if (variable) {
    return {
      stability: "variable",
      hasData: true,
      label: "Variable",
      description: "Okay for browsing; calls may stutter.",
    };
  }

  return {
    stability: "unstable",
    hasData: true,
    label: "Unstable",
    description: "Expect buffering and dropped calls.",
  };
}

// CSS colour variable per stability rating — mirrors the tier colour
// vocabulary so the visual language stays consistent: green = good,
// amber = caution, red = bad.
export const STABILITY_COLOUR: Record<Stability, string> = {
  stable: "var(--color-express)",
  variable: "var(--color-local)",
  unstable: "var(--color-suspended)",
};
