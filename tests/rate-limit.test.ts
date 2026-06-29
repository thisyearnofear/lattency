import { describe, it, expect } from "vitest";
import { hashIp } from "@/lib/rate-limit";

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
