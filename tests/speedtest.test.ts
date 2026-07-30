import { describe, it, expect } from "vitest";
import { median, meanAbsoluteDeviation, round } from "@/lib/speedtest";

describe("median", () => {
  it("returns the middle value for odd-length input", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("averages the two middle values for even-length input", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it("does not mutate the input", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe("meanAbsoluteDeviation", () => {
  it("is zero for identical samples", () => {
    expect(meanAbsoluteDeviation([20, 20, 20])).toBe(0);
  });
  it("measures spread around the median", () => {
    // median([10, 20, 30]) = 20; MAD = (10 + 0 + 10) / 3
    expect(meanAbsoluteDeviation([10, 20, 30])).toBeCloseTo(6.6667, 3);
  });
});

describe("round", () => {
  it("rounds to the given decimals", () => {
    expect(round(12.345, 1)).toBe(12.3);
    expect(round(12.35, 1)).toBe(12.4);
    expect(round(123.456, 0)).toBe(123);
  });
});
