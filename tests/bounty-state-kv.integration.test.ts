// Integration test for RedisBountyState against a live Upstash Redis instance.
// Skips gracefully when UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN
// are not configured. Uses a unique key prefix per run so tests are isolated
// and clean up after themselves.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Redis } from "@upstash/redis";
import * as crypto from "node:crypto";
import { RedisBountyState, UpstashRedisAdapter } from "@/lib/bounty-state-kv";

const url =
  typeof process !== "undefined" ? process.env.UPSTASH_REDIS_REST_URL : undefined;
const token =
  typeof process !== "undefined"
    ? process.env.UPSTASH_REDIS_REST_TOKEN
    : undefined;
const isConfigured = Boolean(url && token);

if (!isConfigured) {
  console.info("Skipping RedisBountyState integration tests: UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set.");
}

describe.runIf(isConfigured)("RedisBountyState (integration)", () => {
  let redis: Redis;
  let state: RedisBountyState;
  let testPrefix: string;

  beforeEach(() => {
    redis = new Redis({ url: url!, token: token! });
    testPrefix = `lattency-test:${crypto.randomUUID()}`;
    state = new RedisBountyState(new UpstashRedisAdapter(redis), testPrefix);
  });

  afterEach(async () => {
    // Guard against a failed beforeEach that left state uninitialised.
    if (!state) return;
    await state.resetForTests();
  });

  it("tracks paid bounties in a Redis set", async () => {
    await state.markPaid("b-1");
    await state.markPaid("b-2");
    await state.markPaid("b-1");

    const paid = await state.getPaidBounties();
    expect(paid).toHaveLength(2);
    expect(paid).toContain("b-1");
    expect(paid).toContain("b-2");
  });

  it("acquires a lock with SET NX and returns a lease token", async () => {
    const token = await state.tryAcquireClaimLock("b-1", { ttlMs: 60_000 });
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
  });

  it("returns null when the lock is already held", async () => {
    const first = await state.tryAcquireClaimLock("b-1", { ttlMs: 60_000 });
    expect(first).toBeTruthy();

    const second = await state.tryAcquireClaimLock("b-1", { ttlMs: 60_000 });
    expect(second).toBeNull();
  });

  it("releases the lock only when given the matching lease token", async () => {
    const token = (await state.tryAcquireClaimLock("b-1", { ttlMs: 60_000 }))!;

    expect(await state.releaseClaimLock("b-1", "wrong-token")).toBe(false);
    expect(await state.releaseClaimLock("b-1", token)).toBe(true);
    expect(await state.tryAcquireClaimLock("b-1", { ttlMs: 60_000 })).toBeTruthy();
  });

  it("extends the lock only when given the matching lease token", async () => {
    const token = (await state.tryAcquireClaimLock("b-1", { ttlMs: 60_000 }))!;

    expect(await state.extendClaimLock("b-1", "wrong-token", { ttlMs: 120_000 })).toBe(false);
    expect(await state.extendClaimLock("b-1", token, { ttlMs: 120_000 })).toBe(true);
  });

  it("rejects release/extend for a lock that was never acquired", async () => {
    expect(await state.releaseClaimLock("b-missing", "any-token")).toBe(false);
    expect(await state.extendClaimLock("b-missing", "any-token")).toBe(false);
  });

  it("clears all lock keys and paid bounties on resetForTests", async () => {
    await state.markPaid("b-1");
    const token = (await state.tryAcquireClaimLock("b-1", { ttlMs: 60_000 }))!;

    await state.resetForTests();

    expect(await state.getPaidBounties()).toEqual([]);
    expect(await state.releaseClaimLock("b-1", token)).toBe(false);
  });

  it("shares state across multiple RedisBountyState instances using the same prefix", async () => {
    const stateB = new RedisBountyState(new UpstashRedisAdapter(redis), testPrefix);

    await state.markPaid("shared-bounty");
    const paid = await stateB.getPaidBounties();
    expect(paid).toContain("shared-bounty");

    const token = (await state.tryAcquireClaimLock("shared-bounty", {
      ttlMs: 60_000,
    }))!;

    expect(await stateB.tryAcquireClaimLock("shared-bounty", { ttlMs: 60_000 })).toBeNull();
    expect(await stateB.releaseClaimLock("shared-bounty", "wrong-token")).toBe(false);
    expect(await stateB.extendClaimLock("shared-bounty", "wrong-token", { ttlMs: 60_000 })).toBe(false);
    expect(await stateB.extendClaimLock("shared-bounty", token, { ttlMs: 120_000 })).toBe(true);
    expect(await stateB.releaseClaimLock("shared-bounty", token)).toBe(true);
  });
});
