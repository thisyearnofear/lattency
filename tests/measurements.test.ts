import { describe, it, expect } from "vitest";
import {
  deviceTypeFromUA,
  resolveTestMethod,
  deriveTimeBucket,
  validateMeasurement,
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

describe("deriveTimeBucket (Africa/Nairobi)", () => {
  it("returns morning for a 7am-ish UTC stamp (10am Nairobi)", () => {
    expect(deriveTimeBucket(new Date("2026-06-29T07:00:00Z"))).toBe("morning");
  });
  it("returns afternoon for a 12 UTC stamp (3pm Nairobi)", () => {
    expect(deriveTimeBucket(new Date("2026-06-29T12:00:00Z"))).toBe("afternoon");
  });
  it("returns evening for a 17 UTC stamp (8pm Nairobi)", () => {
    expect(deriveTimeBucket(new Date("2026-06-29T17:00:00Z"))).toBe("evening");
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
