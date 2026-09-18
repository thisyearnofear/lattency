// Capability — what a connection can actually DO, as opposed to how fast it
// is rated.
//
// Why this exists: the map's tier is derived from download alone
// (`tierForDown`). A café measuring 60 Mbps down and 2 Mbps up is therefore
// "Express" and carries the badge "video calls OK" — but upload is the
// constraint that breaks a video call, and 2 Mbps up will not hold one. The
// tier isn't wrong about the line; it's answering a different question than
// the one the user is asking.
//
// So this module answers the user's question directly, using every direction
// of the measurement, and names the metric that is holding things back. It
// does not replace the tier — the three lines stay a download-speed metaphor —
// it corrects for it, which is why the UI presents it as a caveat rather than
// a competing verdict.
//
// Pure: no DB, no clock, no formatting beyond the human notes.

/** The measurement fields this module reasons over. */
export interface StationMetrics {
  downMbps: number;
  upMbps: number;
  latencyMs: number;
  /**
   * Packet loss %. Optional because the read path reports 0 both when loss was
   * measured at zero and when it was never measured (manual readings carry no
   * loss figure). 0 is therefore treated as "no evidence of a problem" rather
   * than as evidence of a good line — it can only fail to downgrade.
   */
  lossPct?: number;
  /** Readings on file. 0 means estimated, so no capability claim is made. */
  samples: number;
}

export type Verdict = "yes" | "marginal" | "no" | "unknown";

/** The measurement limiting quality, when one is. */
export type Bottleneck = "download" | "upload" | "latency" | "packet loss";

export interface CallReadiness {
  verdict: Verdict;
  bottleneck: Bottleneck | null;
  /** Human sentence for the drawer / agent payload. */
  note: string;
}

export interface Capability {
  id: "video-calls" | "uploading" | "large-downloads";
  label: string;
  verdict: Verdict;
  note: string;
}

/**
 * Thresholds, with their provenance.
 *
 * Video calling is the binding constraint for a laptop worker, so it drives
 * the numbers. Google Meet needs roughly 3.2 Mbps each way for HD and Zoom
 * about 3.0; the floors below sit at or just above those so a "yes" means
 * comfortable rather than exactly-enough. These are deliberately conservative:
 * an overstated "yes" costs a failed client call, an overstated "no" costs a
 * coffee. Asymmetric loss is the right way to be wrong here.
 */
export const CALL_REQUIREMENTS = {
  downMbps: 4,
  upMbps: 3,
  latencyMs: 150,
  lossPct: 2.5,
} as const;

/** Ratio-to-requirement at or above which a call is a comfortable "yes". */
const COMFORTABLE = 1.5;

const UPLOAD_YES_MBPS = 10;
const UPLOAD_MARGINAL_MBPS = 5;
const DOWNLOAD_YES_MBPS = 100;
const DOWNLOAD_MARGINAL_MBPS = 40;

/** One decimal place, without a trailing ".0". */
function mbps(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function annotate(bottleneck: Bottleneck, metrics: StationMetrics): string {
  switch (bottleneck) {
    case "download":
      return `Download ${mbps(metrics.downMbps)} Mbps is below the ${CALL_REQUIREMENTS.downMbps} Mbps a video call wants.`;
    case "upload":
      return `Upload ${mbps(metrics.upMbps)} Mbps is below the ${CALL_REQUIREMENTS.upMbps} Mbps a video call wants.`;
    case "latency":
      return `Latency ${Math.round(metrics.latencyMs)} ms is above the ${CALL_REQUIREMENTS.latencyMs} ms calls tolerate.`;
    case "packet loss":
      return `Packet loss ${mbps(metrics.lossPct ?? 0)}% will break call audio.`;
  }
}

/**
 * Can you take a video call here?
 *
 * Works by headroom rather than a checklist: each requirement becomes a ratio
 * of what the line provides to what the call needs, and the smallest ratio is
 * both the verdict and the reason. That way the reported bottleneck is always
 * the true limiting factor, not merely the first threshold that happened to be
 * checked — a café can clear its download floor comfortably and still be held
 * back by upload, which is the case this module exists to expose.
 */
export function videoCallReadiness(metrics: StationMetrics): CallReadiness {
  if (metrics.samples <= 0) {
    return { verdict: "unknown", bottleneck: null, note: "No readings yet — tier is estimated." };
  }

  const ratios: Array<{ metric: Bottleneck; ratio: number }> = [
    { metric: "upload", ratio: metrics.upMbps / CALL_REQUIREMENTS.upMbps },
    { metric: "download", ratio: metrics.downMbps / CALL_REQUIREMENTS.downMbps },
  ];

  // Latency of 0 means "not recorded", not "instant" — skip rather than
  // handing out a free pass.
  if (metrics.latencyMs > 0) {
    ratios.push({ metric: "latency", ratio: CALL_REQUIREMENTS.latencyMs / metrics.latencyMs });
  }

  // Loss is only informative when it is non-zero (see StationMetrics.lossPct).
  if ((metrics.lossPct ?? 0) > 0) {
    ratios.push({ metric: "packet loss", ratio: CALL_REQUIREMENTS.lossPct / (metrics.lossPct ?? 1) });
  }

  const worst = ratios.reduce((a, b) => (b.ratio < a.ratio ? b : a));

  if (worst.ratio >= COMFORTABLE) {
    return { verdict: "yes", bottleneck: null, note: "Holds a video call with room to spare." };
  }
  if (worst.ratio >= 1) {
    // Clears the bar, but narrowly enough that the weak metric is worth naming.
    return { verdict: "marginal", bottleneck: worst.metric, note: annotate(worst.metric, metrics) };
  }
  return { verdict: "no", bottleneck: worst.metric, note: annotate(worst.metric, metrics) };
}

/** How much weight a set of readings deserves. */
export type ConfidenceLevel = "none" | "indicative" | "supported" | "well-supported";

/**
 * Grade a station's evidence by sample size.
 *
 * Lives beside the capability logic because it serves the same purpose: to
 * keep the product from stating more than it knows. A tier derived from one
 * browser test is a hypothesis, and every surface that publishes a tier — the
 * drawer, /api/llm, /api/network — should say so in the same words, which is
 * why this is shared rather than reimplemented per route.
 */
export function sampleConfidence(samples: number): ConfidenceLevel {
  if (samples <= 0) return "none";
  if (samples === 1) return "indicative";
  if (samples < 4) return "supported";
  return "well-supported";
}

/** Plain-language reading of a confidence level, for text surfaces. */
export const CONFIDENCE_NOTE: Record<ConfidenceLevel, string> = {
  none: "no verified readings",
  indicative: "a single reading — treat as provisional",
  supported: "a few readings",
  "well-supported": "multiple readings",
};

/** All capability verdicts for a station, for the drawer and the agent API. */
export function capabilities(metrics: StationMetrics): Capability[] {
  const call = videoCallReadiness(metrics);

  const uploading: Verdict =
    metrics.samples <= 0
      ? "unknown"
      : metrics.upMbps >= UPLOAD_YES_MBPS
        ? "yes"
        : metrics.upMbps >= UPLOAD_MARGINAL_MBPS
          ? "marginal"
          : "no";

  const downloads: Verdict =
    metrics.samples <= 0
      ? "unknown"
      : metrics.downMbps >= DOWNLOAD_YES_MBPS
        ? "yes"
        : metrics.downMbps >= DOWNLOAD_MARGINAL_MBPS
          ? "marginal"
          : "no";

  return [
    { id: "video-calls", label: "Video calls", verdict: call.verdict, note: call.note },
    {
      id: "uploading",
      label: "Uploading",
      verdict: uploading,
      note:
        uploading === "yes"
          ? `Upload ${mbps(metrics.upMbps)} Mbps — fine for pushing files.`
          : `Upload ${mbps(metrics.upMbps)} Mbps caps how fast you can send.`,
    },
    {
      id: "large-downloads",
      label: "Large files",
      verdict: downloads,
      note:
        downloads === "yes"
          ? `Download ${mbps(metrics.downMbps)} Mbps — big files land quickly.`
          : `Download ${mbps(metrics.downMbps)} Mbps — expect a wait on big files.`,
    },
  ];
}

/** The tier a download-only derivation would assign. Mirrors `tierForDown`. */
function tierByDownload(downMbps: number): "express" | "local" | "suspended" {
  return downMbps >= 50 ? "express" : downMbps >= 10 ? "local" : "suspended";
}

/**
 * True when the station's tier overstates what the connection can do — a fast
 * line whose upload can't carry a call.
 *
 * Used for the drawer's reconciliation notice, where the job is to explain why
 * the tier badge and the capability verdicts disagree. The tier isn't wrong;
 * it answers a download-shaped question, and this says so.
 */
export function tierOverstatesCall(metrics: StationMetrics): boolean {
  if (metrics.samples <= 0) return false;
  if (tierByDownload(metrics.downMbps) === "suspended") return false; // already flagged as poor
  return videoCallReadiness(metrics).verdict === "no";
}

/**
 * The bottleneck worth flagging on a compact card, or null when there is
 * nothing to add.
 *
 * Deliberately broader than `tierOverstatesCall`: any station the tier does
 * *not* already condemn but which cannot comfortably hold a call is worth one
 * line on a card, whatever the cause. Gating the card on tier-vs-verdict
 * disagreement alone turned out to render on no station at all, because the
 * only stations failing calls were the ones already on the suspended line.
 *
 * Returns null for a suspended station: the card already reads "avoid for
 * calls", and repeating it is noise.
 */
export function callCaveat(metrics: StationMetrics): Bottleneck | null {
  if (metrics.samples <= 0) return null;
  if (tierByDownload(metrics.downMbps) === "suspended") return null;
  const call = videoCallReadiness(metrics);
  if (call.verdict === "yes" || !call.bottleneck) return null;
  return call.bottleneck;
}
