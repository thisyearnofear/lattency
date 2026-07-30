import { describe, it, expect } from "vitest";
import {
  deviceTypeFromUA,
  resolveTestMethod,
  validateMeasurement,
  isOutlierReading,
} from "@/lib/measurements";

describe("deviceTypeFromUA", () => {
  it("returns null when no UA is provided", () => {
    expect(deviceTypeFromUA(null)).toBeNull();
  });
  it("identifies mobile UAs", () => {
    expect(deviceTypeFromUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari")).toBe("mobile");
    expect(deviceTypeFromUA("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("mobile");
  });
  it("identifies tablet UAs", () => {
    expect(deviceTypeFromUA("Mozilla/5.0 (iPad; CPU OS 17_0) Safari")).toBe("tablet");
  });
  it("falls back to desktop for everything else", () => {
    expect(deviceTypeFromUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari")).toBe("desktop");
  });
});

describe("resolveTestMethod", () => {
  const base = { cafeId: "x", downMbps: 50, upMbps: 10, latencyMs: 25 };
  it("treats absent download metadata as manual even when the client claims auto", () => {
    expect(
      resolveTestMethod({ ...base, testMethod: "browser-auto" }),
    ).toBe("manual");
  });
  it("recognizes complete auto-test metadata as browser-auto", () => {
    expect(
      resolveTestMethod({
        ...base,
        downloadBytes: 10_485_760,
        downloadDurationMs: 1200,
      }),
    ).toBe("browser-auto");
  });
});

describe("validateMeasurement", () => {
  const ok = { cafeId: "x", downMbps: 50, upMbps: 10, latencyMs: 25 };
  it("accepts a clean reading", () => {
    expect(validateMeasurement(ok)).toBeNull();
  });
  it("rejects negative downMbps", () => {
    expect(validateMeasurement({ ...ok, downMbps: -1 })).toMatch(/downMbps/);
  });
  it("rejects absurdly high downMbps", () => {
    expect(validateMeasurement({ ...ok, downMbps: 99_999 })).toMatch(/downMbps/);
  });
  it("rejects negative jitter when provided", () => {
    expect(validateMeasurement({ ...ok, jitterMs: -2 })).toMatch(/jitter/);
  });
  it("rejects loss > 100%", () => {
    expect(validateMeasurement({ ...ok, lossPct: 150 })).toMatch(/loss/);
  });
  it("rejects NaN values", () => {
    expect(validateMeasurement({ ...ok, latencyMs: Number.NaN })).toMatch(/latency/);
  });
});

describe("isOutlierReading", () => {
  it("never flags when there are fewer than 3 existing measurements", () => {
    expect(isOutlierReading(50, 2, 500)).toBe(false);
  });
  it("flags a reading more than 5x the median", () => {
    expect(isOutlierReading(50, 5, 260)).toBe(true);
  });
  it("flags a reading below 0.2x the median", () => {
    expect(isOutlierReading(50, 5, 9)).toBe(true);
  });
  it("does not flag a reading within the expected band", () => {
    expect(isOutlierReading(50, 5, 55)).toBe(false);
  });
  it("does not flag when the median is not usable", () => {
    expect(isOutlierReading(0, 5, 500)).toBe(false);
    expect(isOutlierReading(Number.NaN, 5, 500)).toBe(false);
  });
});
