import { describe, it, expect } from "vitest";
import {
  isValidLatitude,
  isValidLongitude,
  isValidCoordinates,
  shouldRequestGeolocation,
  haversineKm,
} from "@/lib/geo";

describe("coordinate validation", () => {
  it("accepts the WGS84 bounds edges", () => {
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);
  });

  it("rejects out-of-range values", () => {
    expect(isValidLatitude(90.0001)).toBe(false);
    expect(isValidLatitude(-91)).toBe(false);
    expect(isValidLongitude(180.5)).toBe(false);
    expect(isValidLongitude(-181)).toBe(false);
  });

  it("rejects non-finite input (blank / NaN from parseFloat)", () => {
    expect(isValidLatitude(NaN)).toBe(false);
    expect(isValidLongitude(NaN)).toBe(false);
    expect(isValidLatitude(Infinity)).toBe(false);
    expect(isValidLongitude(-Infinity)).toBe(false);
  });

  it("isValidCoordinates requires both halves in range", () => {
    expect(isValidCoordinates(51.525, -0.077)).toBe(true);
    expect(isValidCoordinates(91, -0.077)).toBe(false);
    expect(isValidCoordinates(51.525, 181)).toBe(false);
    expect(isValidCoordinates(NaN, 0)).toBe(false);
  });
});

describe("geolocation request gating", () => {
  it("only permits requests from a user gesture", () => {
    expect(shouldRequestGeolocation("user-gesture")).toBe(true);
    expect(shouldRequestGeolocation("auto")).toBe(false);
  });
});

describe("haversineKm", () => {
  it("returns ~0 for identical points", () => {
    expect(haversineKm({ lat: 51.5, lng: -0.1 }, { lat: 51.5, lng: -0.1 })).toBe(0);
  });
});
