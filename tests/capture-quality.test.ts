import { describe, it, expect } from "vitest";
import {
  CAPTURE_SECTORS,
  CAPTURE_SECTOR_SET,
  coverageSectorsFromOrientation,
  isRelativelyBlurry,
  orderedSectors,
  paceTooFast,
  PACE_ROTATION_WARN_DPS,
  qualityScore,
  sectorFromHeading,
  sharpnessOf,
} from "@/lib/capture-quality";

// Build an RGBA buffer: `fill` for the whole frame, with an optional noise
// pattern so sharpness differs between inputs.
function rgbaFrame(
  width: number,
  height: number,
  noisy: boolean,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = noisy ? ((i * 31 + ((i / width) | 0) * 17) % 256) : 128;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe("sectorFromHeading", () => {
  it("maps compass headings to the eight sectors and wraps around", () => {
    expect(sectorFromHeading(0)).toBe("N");
    // Sectors span ±22.5° around their heading — 22 stays N, 23 flips NE.
    expect(sectorFromHeading(22)).toBe("N");
    expect(sectorFromHeading(23)).toBe("NE");
    expect(sectorFromHeading(45)).toBe("NE");
    expect(sectorFromHeading(90)).toBe("E");
    expect(sectorFromHeading(180)).toBe("S");
    expect(sectorFromHeading(270)).toBe("W");
    expect(sectorFromHeading(315)).toBe("NW");
    expect(sectorFromHeading(359)).toBe("N");
    expect(sectorFromHeading(360)).toBe("N");
    expect(sectorFromHeading(-45)).toBe("NW");
    expect(sectorFromHeading(720 + 90)).toBe("E");
  });
});

describe("coverageSectorsFromOrientation", () => {
  it("folds headings into canonical-order unique sectors, skipping junk", () => {
    const sectors = coverageSectorsFromOrientation([
      90,
      0,
      null,
      undefined,
      NaN,
      92,
      270,
      Infinity,
    ]);
    expect(sectors).toEqual(["N", "E", "W"]);
  });

  it("returns an empty list when no orientation data ever arrived", () => {
    expect(coverageSectorsFromOrientation([null, undefined, NaN])).toEqual([]);
  });
});

describe("orderedSectors", () => {
  it("orders a recorded set canonically regardless of visit order", () => {
    expect(orderedSectors(new Set(["W", "N", "S"]))).toEqual(["N", "S", "W"]);
    expect(orderedSectors([])).toEqual([]);
  });
});

describe("sharpnessOf", () => {
  it("scores a noisy frame higher than a flat frame", () => {
    const noisy = sharpnessOf(rgbaFrame(32, 32, true), 32, 32);
    const flat = sharpnessOf(rgbaFrame(32, 32, false), 32, 32);
    expect(noisy).toBeGreaterThan(0);
    expect(flat).toBe(0);
    expect(noisy).toBeGreaterThan(flat);
  });

  it("returns 0 for degenerate inputs", () => {
    expect(sharpnessOf(new Uint8ClampedArray(0), 0, 0)).toBe(0);
    expect(sharpnessOf(rgbaFrame(2, 2, true), 2, 2)).toBe(0);
    expect(sharpnessOf(rgbaFrame(8, 8, true).slice(0, 10), 8, 8)).toBe(0);
  });
});

describe("isRelativelyBlurry", () => {
  it("flags drops below the relative threshold of the run peak", () => {
    expect(isRelativelyBlurry(30, 100)).toBe(true); // < 35% of peak
    expect(isRelativelyBlurry(40, 100)).toBe(false);
    expect(isRelativelyBlurry(0, 0)).toBe(false); // no baseline yet
    expect(isRelativelyBlurry(NaN, 100)).toBe(false);
  });
});

describe("paceTooFast", () => {
  it("warns above the rotation-rate cap and ignores absent samples", () => {
    expect(paceTooFast(PACE_ROTATION_WARN_DPS + 1)).toBe(true);
    expect(paceTooFast(-(PACE_ROTATION_WARN_DPS + 50))).toBe(true);
    expect(paceTooFast(PACE_ROTATION_WARN_DPS - 1)).toBe(false);
    expect(paceTooFast(null)).toBe(false);
    expect(paceTooFast(undefined)).toBe(false);
    expect(paceTooFast(NaN)).toBe(false);
  });
});

describe("qualityScore", () => {
  it("weights sharpness 40, coverage 40, pace 20", () => {
    // Perfect run: all frames sharp, all 8 sectors, no pace warnings.
    expect(
      qualityScore({
        framesCaptured: 100,
        sharpFrames: 100,
        sectorsCovered: 8,
        paceWarnings: 0,
      }),
    ).toBe(100);

    // Half-sharp, half-covered, quarter-fast → 20 + 20 + 15 = 55.
    expect(
      qualityScore({
        framesCaptured: 100,
        sharpFrames: 50,
        sectorsCovered: 4,
        paceWarnings: 25,
      }),
    ).toBe(55);
  });

  it("returns 0 with no frames and clamps out-of-range inputs", () => {
    expect(
      qualityScore({
        framesCaptured: 0,
        sharpFrames: 0,
        sectorsCovered: 8,
        paceWarnings: 0,
      }),
    ).toBe(0);
    expect(
      qualityScore({
        framesCaptured: 10,
        sharpFrames: 50,
        sectorsCovered: 12,
        paceWarnings: -5,
      }),
    ).toBe(100);
  });
});

describe("sector vocabulary", () => {
  it("CAPTURE_SECTOR_SET mirrors CAPTURE_SECTORS exactly", () => {
    expect(CAPTURE_SECTOR_SET.size).toBe(CAPTURE_SECTORS.length);
    for (const s of CAPTURE_SECTORS) expect(CAPTURE_SECTOR_SET.has(s)).toBe(true);
  });
});
