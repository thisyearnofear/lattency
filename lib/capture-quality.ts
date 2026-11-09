// Capture-quality math for the v2 live-run coach (docs/venue-3d-ux-research.md
// §4) — pure functions, no DOM, so the same code the coach runs per frame is
// directly unit-testable. The honest-labeling rule applies to everything
// here: these functions measure *inputs* (sharpness, heading, rotation rate),
// never geometry — a sector means "a view was recorded facing this way", not
// "this part of the room is modeled".

/** Compass sectors for the coverage dial. Index order is clockwise from N. */
export const CAPTURE_SECTORS = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const;

export type CaptureSector = (typeof CAPTURE_SECTORS)[number];

/** Validation set shared with the gateway's sector allowlist. */
export const CAPTURE_SECTOR_SET: ReadonlySet<string> = new Set(CAPTURE_SECTORS);

/** Compass heading (deg, 0=N, clockwise) → sector. Wraps any real number. */
export function sectorFromHeading(headingDeg: number): CaptureSector {
  const normalized = ((headingDeg % 360) + 360) % 360;
  return CAPTURE_SECTORS[Math.round(normalized / 45) % CAPTURE_SECTORS.length];
}

/** Fold a stream of heading samples into the ordered set of sectors visited.
 *  Non-finite/absent samples are skipped. Output order is canonical (N→NW),
 *  not visit order, so stored manifests compare stably. */
export function coverageSectorsFromOrientation(
  headings: Iterable<number | null | undefined>,
): CaptureSector[] {
  const seen = new Set<CaptureSector>();
  for (const h of headings) {
    if (typeof h !== "number" || !Number.isFinite(h)) continue;
    seen.add(sectorFromHeading(h));
  }
  return CAPTURE_SECTORS.filter((s) => seen.has(s));
}

/** Order a set of recorded sectors canonically (N→NW). */
export function orderedSectors(sectors: Iterable<string>): CaptureSector[] {
  const seen = new Set(sectors);
  return CAPTURE_SECTORS.filter((s) => seen.has(s));
}

/**
 * Laplacian-variance sharpness over an RGBA pixel buffer (e.g. ImageData.data
 * from a downsampled canvas). Higher = sharper; the absolute value is
 * scene-dependent — per the research, callers should compare *relative*
 * degradation within a run (see isRelativelyBlurry), not a universal cutoff.
 *
 * Uses the 4-neighbour Laplacian over interior pixels on a gray projection.
 * Returns 0 for degenerate inputs (< 3×3, short buffer).
 */
export function sharpnessOf(
  rgba: Uint8ClampedArray | number[],
  width: number,
  height: number,
): number {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return 0;
  if (width < 3 || height < 3) return 0;
  const px = width * height;
  if (rgba.length < px * 4) return 0;

  // Gray projection (Rec. 601 luma).
  const gray = new Float64Array(px);
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    gray[i] = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      const lap =
        4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return variance > 0 ? variance : 0;
}

/** A frame counts as blurry when its sharpness drops below this fraction of
 *  the run's sharpest frame so far (relative degradation, per §4 guidance). */
export const RELATIVE_BLUR_RATIO = 0.35;

export function isRelativelyBlurry(sharpness: number, runningPeak: number): boolean {
  if (!Number.isFinite(sharpness) || !Number.isFinite(runningPeak)) return false;
  if (runningPeak <= 0) return false;
  return sharpness < runningPeak * RELATIVE_BLUR_RATIO;
}

/** Rotation rate (deg/s) above which the coach warns "slow down". Rotation
 *  rate ≠ translation — this only ever triggers a pace hint, never a
 *  trajectory inference. */
export const PACE_ROTATION_WARN_DPS = 100;

export function paceTooFast(rotationDegPerSec: number | null | undefined): boolean {
  if (rotationDegPerSec == null || !Number.isFinite(rotationDegPerSec)) return false;
  return Math.abs(rotationDegPerSec) > PACE_ROTATION_WARN_DPS;
}

export interface CaptureQualityInputs {
  /** Frames the run attempted to send. */
  framesCaptured: number;
  /** Frames above the relative-sharpness bar. */
  sharpFrames: number;
  /** Distinct sectors recorded, 0–8. */
  sectorsCovered: number;
  /** Frames flagged for excessive rotation rate. */
  paceWarnings: number;
}

/**
 * The 0–100 capture score written to `VenueScan.quality_score` — an
 * input-quality signal used to order the GPU queue, not a guarantee the
 * scene will register. Weights: 40% sharp frames, 40% sector coverage,
 * 20% calm pace. Face events are stored separately, not folded in — a
 * consented empty-room capture and a flagged one can score identically.
 */
export function qualityScore(inputs: CaptureQualityInputs): number {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const frames = Math.max(0, Math.floor(inputs.framesCaptured));
  if (frames === 0) return 0;
  const sharp = clamp01(inputs.sharpFrames / frames);
  const coverage = clamp01(inputs.sectorsCovered / CAPTURE_SECTORS.length);
  const pace = clamp01(1 - inputs.paceWarnings / frames);
  return Math.round(100 * (0.4 * sharp + 0.4 * coverage + 0.2 * pace));
}
