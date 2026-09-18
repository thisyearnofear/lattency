import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { RedisBountyState } from "@/lib/bounty-state-kv";
import { bountyState, setBountyState, InMemoryBountyState } from "@/lib/bounty-state";
import { MockRedisClient } from "@/tests/mocks/redis-client";
import type { PayoutResult } from "@/lib/nimiq-payout";

const executeNimiqPayout = vi.fn().mockResolvedValue({
  txHash: "0xredisroute",
  status: "paid",
  amountLunas: 500_000,
  recipient: "NQ07 REDIS00000000000000000000000000",
} as PayoutResult);

/** Anonymous contributor the test bounties are attributed to. */
const CONTRIB = "contrib-redis-abc123";

vi.mock("@/lib/nimiq-payout", () => ({
  executeNimiqPayout: (...args: unknown[]) => executeNimiqPayout(...args),
}));

// Force the mock-mode read path. This test is about the Redis-backed
// BountyState driving the claim route, and it builds its fixture with the
// in-memory `createBounty`. If Base44 is considered configured, `getBounties`
// reads the remote entity instead and the local fixture becomes invisible —
// so the assertion would depend on the developer's .env.local. `getBase44`
// throws rather than returning a stub, so an accidental reach into Base44
// fails loudly instead of passing quietly.
vi.mock("@/lib/base44", () => ({
  base44Configured: false,
  getBase44: () => {
    throw new Error("Base44 must not be reached in this test");
  },
}));

describe("POST /api/bounties/claim with Redis-backed BountyState", () => {
  let client: MockRedisClient;

  beforeEach(() => {
    client = new MockRedisClient();
    setBountyState(new RedisBountyState(client));
    executeNimiqPayout.mockReset().mockResolvedValue({
      txHash: "0xredisroute",
      status: "paid",
      amountLunas: 500_000,
      recipient: "NQ07 REDIS00000000000000000000000000",
    } as PayoutResult);
  });

  afterEach(() => {
    // Restore a fresh in-memory singleton so this test file does not leak
    // Redis state to other test files that may run in the same process.
    setBountyState(new InMemoryBountyState());
  });

  it("claims a bounty and persists the paid state in Redis", async () => {
    const { createBounty, getBounties } = await import("@/lib/bounties");
    const bounty = await createBounty({
      goal: "Redis route test bounty",
      area: "Test",
      rewardNim: 5,
      target: 1,
      sponsor: "Test",
      sponsorKind: "community",
      kind: "first-in-neighbourhood",
      expiresAt: "2099-12-31",
    });
    // createBounty seeds progress at 0; make the bounty eligible for claim.
    bounty.progress = 1;
    // Attribution lives in the Redis-backed state, so this also proves the
    // contributor set is shared across instances the way the paid set is.
    await bountyState.recordContributor(bounty.id, CONTRIB);

    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      new NextRequest("http://localhost/api/bounties/claim", {
        method: "POST",
        body: JSON.stringify({
          bountyId: bounty.id,
          nimiqAddress: "NQ07 REDIS00000000000000000000000000",
          contributorId: CONTRIB,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      bountyId: bounty.id,
      rewardNim: 5,
    });

    // The lock was acquired then released.
    expect(client.getStore().has(`bounty:lock:${bounty.id}`)).toBe(false);

    // The paid set contains the bounty id.
    expect(client.getSets().get("bounty:paid")?.has(bounty.id)).toBe(true);

    // The contributor set for this bounty is in Redis too.
    expect(client.getSets().get(`bounty:contributors:${bounty.id}`)?.has(CONTRIB)).toBe(true);

    // getBounties filters out the paid bounty using the Redis-backed state.
    const bounties = await getBounties();
    expect(bounties.find((b) => b.id === bounty.id)).toBeUndefined();
  });

  it("returns 409 when the same bounty is already being claimed (Redis lock)", async () => {
    const { createBounty } = await import("@/lib/bounties");
    const bounty = await createBounty({
      goal: "Redis concurrent test bounty",
      area: "Test",
      rewardNim: 5,
      target: 1,
      sponsor: "Test",
      sponsorKind: "community",
      kind: "first-in-neighbourhood",
      expiresAt: "2099-12-31",
    });
    bounty.progress = 1;
    await bountyState.recordContributor(bounty.id, CONTRIB);

    // Hold the payout open with a shared deferred promise. All invocations
    // resolve together when releasePayout() is called, which prevents a
    // second concurrent call from overwriting the release function.
    let releasePayout: (() => void) | undefined;
    const payoutPromise = new Promise<PayoutResult>((resolve) => {
      releasePayout = () =>
        resolve({
          txHash: "0xconcurrent-redis",
          status: "paid",
          amountLunas: 500_000,
          recipient: "NQ07 CONCURRENT000000000000000000000",
        });
    });
    executeNimiqPayout.mockImplementation(() => payoutPromise);

    const { POST } = await import("@/app/api/bounties/claim/route");

    const first = POST(
      new NextRequest("http://localhost/api/bounties/claim", {
        method: "POST",
        body: JSON.stringify({
          bountyId: bounty.id,
          nimiqAddress: "NQ07 CONCURRENT000000000000000000000",
          contributorId: CONTRIB,
        }),
      }),
    );

    // Wait until the first request has acquired the Redis lock, then fire the
    // second request. Polling avoids the race condition of a fixed sleep.
    await vi.waitFor(() =>
      expect(client.getStore().has(`bounty:lock:${bounty.id}`)).toBe(true),
    );

    const second = POST(
      new NextRequest("http://localhost/api/bounties/claim", {
        method: "POST",
        body: JSON.stringify({
          bountyId: bounty.id,
          nimiqAddress: "NQ07 CONCURRENT000000000000000000000",
          contributorId: CONTRIB,
        }),
      }),
    );

    const secondRes = await second;
    expect(secondRes.status).toBe(409);
    expect(await secondRes.json()).toEqual({ error: "claim already in progress" });

    // Verify the lock is still held in Redis.
    expect(client.getStore().has(`bounty:lock:${bounty.id}`)).toBe(true);

    releasePayout?.();
    const firstRes = await first;
    expect(firstRes.status).toBe(200);

    // The lock was released after the first claim completed.
    expect(client.getStore().has(`bounty:lock:${bounty.id}`)).toBe(false);

    // The paid set now contains the bounty id.
    expect(client.getSets().get("bounty:paid")?.has(bounty.id)).toBe(true);
  });

});
