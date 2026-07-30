import { describe, it, expect, beforeEach } from "vitest";
import { bountyState, createBountyState } from "@/lib/bounty-state";

describe("bountyState", () => {
  beforeEach(async () => {
    await bountyState.resetForTests();
  });

  it("tracks paid bounties", async () => {
    expect(await bountyState.getPaidBounties()).toEqual([]);

    await bountyState.markPaid("b-1");
    await bountyState.markPaid("b-2");

    const paid = await bountyState.getPaidBounties();
    expect(paid).toContain("b-1");
    expect(paid).toContain("b-2");
  });

  it("acquires a claim lock and returns a lease token", async () => {
    const token = await bountyState.tryAcquireClaimLock("b-1");

    expect(typeof token).toBe("string");
    expect(token).toHaveLength(36);

    const second = await bountyState.tryAcquireClaimLock("b-1");
    expect(second).toBeNull();
  });

  it("allows acquiring a claim lock for a different bounty", async () => {
    await bountyState.tryAcquireClaimLock("b-1");
    const other = await bountyState.tryAcquireClaimLock("b-2");

    expect(other).toBeTruthy();
  });

  it("releases a claim lock when given the correct lease token", async () => {
    const token = (await bountyState.tryAcquireClaimLock("b-1"))!;

    await bountyState.releaseClaimLock("b-1", token);

    expect(await bountyState.tryAcquireClaimLock("b-1")).toBeTruthy();
  });

  it("refuses to release a claim lock with the wrong lease token", async () => {
    await bountyState.tryAcquireClaimLock("b-1");

    const released = await bountyState.releaseClaimLock("b-1", "wrong-token");

    expect(released).toBe(false);
    expect(await bountyState.tryAcquireClaimLock("b-1")).toBeNull();
  });

  it("resets all state for tests", async () => {
    await bountyState.markPaid("b-1");
    await bountyState.tryAcquireClaimLock("b-2");

    await bountyState.resetForTests();

    expect(await bountyState.getPaidBounties()).toEqual([]);
    expect(await bountyState.tryAcquireClaimLock("b-2")).toBeTruthy();
  });

  it("allows re-acquiring a lock after the TTL expires", async () => {
    const first = (await bountyState.tryAcquireClaimLock("b-1", { ttlMs: 10 }))!;

    await new Promise((resolve) => setTimeout(resolve, 20));

    const second = await bountyState.tryAcquireClaimLock("b-1", { ttlMs: 10 });
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });

  it("keeps a lock exclusive while the TTL is still valid", async () => {
    await bountyState.tryAcquireClaimLock("b-1", { ttlMs: 500 });

    const second = await bountyState.tryAcquireClaimLock("b-1", { ttlMs: 500 });

    expect(second).toBeNull();
  });

  it("extends a claim lock before it expires", async () => {
    const token = (await bountyState.tryAcquireClaimLock("b-1", { ttlMs: 50 }))!;

    const extended = await bountyState.extendClaimLock("b-1", token, { ttlMs: 200 });

    expect(extended).toBe(true);
    // The lock would have expired at 50ms, but the extension keeps it alive.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await bountyState.tryAcquireClaimLock("b-1")).toBeNull();
  });

  it("fails to extend a lock with the wrong lease token", async () => {
    const token = (await bountyState.tryAcquireClaimLock("b-1", { ttlMs: 500 }))!;

    const extended = await bountyState.extendClaimLock("b-1", "wrong-token", { ttlMs: 500 });

    expect(extended).toBe(false);
    // The original token should still work.
    expect(await bountyState.extendClaimLock("b-1", token, { ttlMs: 500 })).toBe(true);
  });

  it("fails to extend a lock that is missing or expired", async () => {
    expect(await bountyState.extendClaimLock("b-missing", "any-token")).toBe(false);

    const token = (await bountyState.tryAcquireClaimLock("b-expired", { ttlMs: 10 }))!;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await bountyState.extendClaimLock("b-expired", token)).toBe(false);
  });

  it("invalidates the old token after the lock expires and is re-acquired", async () => {
    const oldToken = (await bountyState.tryAcquireClaimLock("b-1", { ttlMs: 10 }))!;

    await new Promise((resolve) => setTimeout(resolve, 20));

    const newToken = (await bountyState.tryAcquireClaimLock("b-1", { ttlMs: 500 }))!;
    expect(newToken).not.toBe(oldToken);

    expect(await bountyState.extendClaimLock("b-1", oldToken)).toBe(false);
    expect(await bountyState.releaseClaimLock("b-1", oldToken)).toBe(false);
    // The lock is still held by the new token.
    expect(await bountyState.tryAcquireClaimLock("b-1")).toBeNull();
  });

  it("createBountyState falls back to in-memory when Redis env vars are absent", async () => {
    const state = await createBountyState();
    expect(await state.getPaidBounties()).toEqual([]);
    // A fresh in-memory state can be reset without throwing.
    await expect(state.resetForTests()).resolves.toBeUndefined();
  });
});
