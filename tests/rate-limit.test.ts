import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  hashIp,
  __resetRateLimitForTests,
} from "@/lib/rate-limit";

const IP = hashIp("203.0.113.42");

describe("hashIp", () => {
  it("returns null for absent IP", () => {
    expect(hashIp(null)).toBeNull();
    expect(hashIp("")).toBeNull();
  });

  it("returns deterministic SHA-256 for the same input", () => {
    const a = hashIp("203.0.113.42");
    const b = hashIp("203.0.113.42");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("strips the X-Forwarded-For comma list to the first IP", () => {
    const a = hashIp("203.0.113.42, 10.0.0.1, 172.16.0.2");
    const b = hashIp("203.0.113.42");
    expect(a).toBe(b);
  });

  it("differs between different IPs", () => {
    expect(hashIp("203.0.113.42")).not.toBe(hashIp("198.51.100.7"));
  });

  it("returns null for a whitespace-only IP", () => {
    expect(hashIp("   ")).toBeNull();
  });
});

describe("checkRateLimit", () => {
  beforeEach(async () => {
    await __resetRateLimitForTests();
  });

  it("always allows when there is no IP to track", async () => {
    for (let i = 0; i < 10; i++) {
      expect(await checkRateLimit(null, { kind: "cafe" })).toBe(true);
    }
  });

  it("allows the first café creation and blocks the second", async () => {
    expect(await checkRateLimit(IP, { kind: "cafe" })).toBe(true);
    expect(await checkRateLimit(IP, { kind: "cafe" })).toBe(false);
  });

  it("tracks measurement limits per café", async () => {
    expect(
      await checkRateLimit(IP, { kind: "measurement", cafeId: "cafe-a" }),
    ).toBe(true);
    expect(
      await checkRateLimit(IP, { kind: "measurement", cafeId: "cafe-a" }),
    ).toBe(false);
    // A different café is independent.
    expect(
      await checkRateLimit(IP, { kind: "measurement", cafeId: "cafe-b" }),
    ).toBe(true);
  });

  it("enforces distinct limits per scope", async () => {
    // Bounty scope allows 5 per window.
    for (let i = 0; i < 5; i++) {
      expect(await checkRateLimit(IP, { kind: "bounty" })).toBe(true);
    }
    expect(await checkRateLimit(IP, { kind: "bounty" })).toBe(false);
  });

  it("keeps separate counters for separate IPs", async () => {
    const other = hashIp("198.51.100.7");
    expect(await checkRateLimit(IP, { kind: "cafe" })).toBe(true);
    expect(await checkRateLimit(IP, { kind: "cafe" })).toBe(false);
    expect(await checkRateLimit(other, { kind: "cafe" })).toBe(true);
  });
});
