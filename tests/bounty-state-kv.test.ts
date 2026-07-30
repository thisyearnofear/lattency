import { describe, it, expect, beforeEach } from "vitest";
import { RedisBountyState } from "@/lib/bounty-state-kv";
import { MockRedisClient } from "@/tests/mocks/redis-client";

describe("RedisBountyState", () => {
  let client: MockRedisClient;
  let state: RedisBountyState;

  beforeEach(() => {
    client = new MockRedisClient();
    state = new RedisBountyState(client);
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
    expect(client.getStore().get("bounty:lock:b-1")).toBe(token);
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

  it("shares state across multiple RedisBountyState instances backed by the same client", async () => {
    const stateA = new RedisBountyState(client);
    const stateB = new RedisBountyState(client);

    await stateA.markPaid("shared-bounty");
    const paid = await stateB.getPaidBounties();
    expect(paid).toContain("shared-bounty");

    const token = (await stateA.tryAcquireClaimLock("shared-bounty", {
      ttlMs: 60_000,
    }))!;

    expect(await stateB.tryAcquireClaimLock("shared-bounty", { ttlMs: 60_000 })).toBeNull();

    expect(await stateB.releaseClaimLock("shared-bounty", "wrong-token")).toBe(false);
    expect(await stateB.extendClaimLock("shared-bounty", "wrong-token", { ttlMs: 60_000 })).toBe(false);

    expect(await stateA.extendClaimLock("shared-bounty", token, { ttlMs: 120_000 })).toBe(true);
    expect(await stateB.releaseClaimLock("shared-bounty", token)).toBe(true);
    expect(await stateA.tryAcquireClaimLock("shared-bounty", { ttlMs: 60_000 })).toBeTruthy();
  });
});
