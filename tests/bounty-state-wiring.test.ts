import { describe, it, expect, vi, afterEach } from "vitest";
import { createBountyState } from "@/lib/bounty-state";
import { RedisBountyState } from "@/lib/bounty-state-kv";

vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: vi.fn().mockReturnValue({
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(0),
      eval: vi.fn().mockResolvedValue(0),
      sadd: vi.fn().mockResolvedValue(1),
      smembers: vi.fn().mockResolvedValue([]),
      keys: vi.fn().mockResolvedValue([]),
    }),
  },
}));

describe("bounty state backend wiring", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a RedisBountyState when Upstash env vars are present and forced", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.stubEnv("UPSTASH_REDIS_REST_FORCE", "1");

    const state = await createBountyState();

    expect(state).toBeInstanceOf(RedisBountyState);
  });

  it("falls back to in-memory when env vars are absent", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_FORCE", "0");

    const state = await createBountyState();

    expect(state).not.toBeInstanceOf(RedisBountyState);
    await expect(state.resetForTests()).resolves.toBeUndefined();
  });
});
