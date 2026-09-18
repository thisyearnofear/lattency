import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { bountyState, CLAIM_LOCK_TTL_MS } from "@/lib/bounty-state";
import type { Bounty } from "@/lib/bounties";

const mockBounties: Bounty[] = [];
const markBountyPaid = vi.fn().mockResolvedValue(undefined);
const executeNimiqPayout = vi.fn().mockResolvedValue({ txHash: "0xclaimtx" });

vi.mock("@/lib/nimiq-payout", () => ({
  executeNimiqPayout: (...args: unknown[]) => executeNimiqPayout(...args),
}));

vi.mock("@/lib/bounties", () => ({
  markBountyPaid: (...args: unknown[]) => markBountyPaid(...args),
  getBounties: vi.fn().mockImplementation(() => Promise.resolve([...mockBounties])),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/bounties/claim", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** The contributor the bounty is attributed to in these tests. Anonymous
 *  (unbound) shape, so the payout-destination rule does not apply. */
const CONTRIB = "contrib-test-abc123";

/** A syntactically valid Nimiq address: NQ + exactly 38 alphanumerics. */
function nq(tag: string): string {
  return `NQ${tag.toUpperCase().replace(/[^0-9A-Z]/g, "").padEnd(38, "A").slice(0, 38)}`;
}

function bountyFixture(id: string, overrides: Partial<Bounty> = {}): Bounty {
  return {
    id,
    goal: "Test bounty",
    area: "Test area",
    amountUsd: 5,
    rewardNim: 5,
    target: 1,
    progress: 1,
    sponsor: "Test",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    expiresAt: "2099-12-31",
    status: "open",
    ...overrides,
  };
}

describe("POST /api/bounties/claim", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    mockBounties.length = 0;
    executeNimiqPayout.mockReset().mockResolvedValue({ txHash: "0xclaimtx" });
    markBountyPaid.mockReset().mockResolvedValue(undefined);
    await bountyState.resetForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("acquires the claim lock with a 5-minute TTL", async () => {
    mockBounties.push({
      id: "b-locked",
      goal: "Locked",
      area: "Test area",
      amountUsd: 5,
      rewardNim: 5,
      target: 1,
      progress: 1,
      sponsor: "Test",
      sponsorKind: "community",
      kind: "first-in-neighbourhood",
      expiresAt: "2099-12-31",
      status: "open",
    });
    await bountyState.recordContributor("b-locked", CONTRIB);

    const lockSpy = vi.spyOn(bountyState, "tryAcquireClaimLock");
    const extendSpy = vi.spyOn(bountyState, "extendClaimLock");
    const releaseSpy = vi.spyOn(bountyState, "releaseClaimLock");

    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      makeRequest({
        bountyId: "b-locked",
        nimiqAddress: "NQ07 LOCK0000000000000000000000000000",
        contributorId: CONTRIB,
      }),
    );

    // The route uses the token returned by tryAcquireClaimLock for all
    // subsequent lock operations.
    const lockToken = await lockSpy.mock.results[0].value;

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, bountyId: "b-locked" });
    expect(lockSpy).toHaveBeenCalledWith("b-locked", {
      ttlMs: CLAIM_LOCK_TTL_MS,
    });
    expect(lockSpy).toHaveBeenCalledTimes(1);
    expect(releaseSpy).toHaveBeenCalledWith("b-locked", lockToken);
    expect(extendSpy).not.toHaveBeenCalled();
  });

  it("claims an eligible bounty and marks it paid", async () => {
    const bounty: Bounty = {
      id: "b-claimable",
      goal: "Test bounty",
      area: "Test area",
      amountUsd: 5,
      rewardNim: 5,
      target: 1,
      progress: 1,
      sponsor: "Test",
      sponsorKind: "community",
      kind: "first-in-neighbourhood",
      expiresAt: "2099-12-31",
      status: "open",
    };
    mockBounties.push(bounty);
    await bountyState.recordContributor("b-claimable", CONTRIB);

    const { POST } = await import("@/app/api/bounties/claim/route");
    const req = makeRequest({
      bountyId: "b-claimable",
      nimiqAddress: "NQ07 CLAIM0000000000000000000000000000",
      contributorId: CONTRIB,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      bountyId: "b-claimable",
      rewardNim: 5,
      txHash: "0xclaimtx",
    });
    expect(executeNimiqPayout).toHaveBeenCalledWith(
      "NQ07 CLAIM0000000000000000000000000000",
      5,
    );
    expect(markBountyPaid).toHaveBeenCalledWith(
      "b-claimable",
      "NQ07 CLAIM0000000000000000000000000000",
      "0xclaimtx",
    );
  });

  it("returns 400 for a missing bountyId", async () => {
    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(makeRequest({ nimiqAddress: "NQ07 TEST0000000000000000000000000000" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bountyId required" });
  });

  it("returns 400 for an invalid Nimiq address", async () => {
    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(makeRequest({ bountyId: "b-claimable", nimiqAddress: "not-an-address" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "valid Nimiq address required" });
  });

  it("returns 400 for malformed JSON", async () => {
    const { POST } = await import("@/app/api/bounties/claim/route");
    const req = new NextRequest("http://localhost/api/bounties/claim", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "body must be JSON" });
  });

  it("returns 400 when the bounty is not eligible because it is already paid", async () => {
    mockBounties.push({
      id: "b-not-open",
      goal: "Not open",
      area: "Test area",
      amountUsd: 5,
      rewardNim: 5,
      target: 1,
      progress: 1,
      sponsor: "Test",
      sponsorKind: "community",
      kind: "first-in-neighbourhood",
      expiresAt: "2099-12-31",
      status: "paid",
    });

    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      makeRequest({
        bountyId: "b-not-open",
        nimiqAddress: "NQ07 TEST0000000000000000000000000000",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bounty not eligible for claim" });
    expect(executeNimiqPayout).not.toHaveBeenCalled();
  });

  it("returns 400 when the bounty progress has not reached the target", async () => {
    mockBounties.push({
      id: "b-incomplete",
      goal: "Incomplete",
      area: "Test area",
      amountUsd: 5,
      rewardNim: 5,
      target: 3,
      progress: 1,
      sponsor: "Test",
      sponsorKind: "community",
      kind: "tier-target",
      expiresAt: "2099-12-31",
      status: "open",
    });

    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      makeRequest({
        bountyId: "b-incomplete",
        nimiqAddress: "NQ07 TEST0000000000000000000000000000",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bounty not eligible for claim" });
    expect(executeNimiqPayout).not.toHaveBeenCalled();
  });

  it("returns 400 and pays nothing for an unfunded seed bounty", async () => {
    // The seed board is served whenever the backend has no sponsor rows, and
    // its progress now comes from the live map — so a filled example is
    // reachable in production. It must never reach the payout call.
    mockBounties.push(
      bountyFixture("b-seed-example", {
        synthetic: true,
        target: 5,
        progress: 5,
        status: "claiming",
      }),
    );
    await bountyState.recordContributor("b-seed-example", CONTRIB);

    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      makeRequest({
        bountyId: "b-seed-example",
        nimiqAddress: "NQ07 TEST0000000000000000000000000000",
        contributorId: CONTRIB,
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "this bounty has no sponsor funds behind it and cannot pay out",
    });
    expect(executeNimiqPayout).not.toHaveBeenCalled();
    expect(markBountyPaid).not.toHaveBeenCalled();
  });

  it("returns 409 when the same bounty is already being claimed", async () => {
    mockBounties.push({
      id: "b-concurrent",
      goal: "Concurrent",
      area: "Test area",
      amountUsd: 5,
      rewardNim: 5,
      target: 1,
      progress: 1,
      sponsor: "Test",
      sponsorKind: "community",
      kind: "first-in-neighbourhood",
      expiresAt: "2099-12-31",
      status: "open",
    });
    await bountyState.recordContributor("b-concurrent", CONTRIB);

    let release: (() => void) | undefined;
    executeNimiqPayout.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ txHash: "0xconcurrent" });
        }),
    );

    const { POST } = await import("@/app/api/bounties/claim/route");

    const first = POST(
      makeRequest({
        bountyId: "b-concurrent",
        nimiqAddress: "NQ07 TEST0000000000000000000000000000",
        contributorId: CONTRIB,
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    const second = POST(
      makeRequest({
        bountyId: "b-concurrent",
        nimiqAddress: "NQ07 TEST0000000000000000000000000000",
        contributorId: CONTRIB,
      }),
    );

    const secondRes = await second;
    expect(secondRes.status).toBe(409);
    expect(await secondRes.json()).toEqual({ error: "claim already in progress" });

    release?.();
    const firstRes = await first;
    expect(firstRes.status).toBe(200);
  });

  it("returns 500 when the payout fails", async () => {
    mockBounties.push({
      id: "b-payout-fail",
      goal: "Payout fails",
      area: "Test area",
      amountUsd: 5,
      rewardNim: 5,
      target: 1,
      progress: 1,
      sponsor: "Test",
      sponsorKind: "community",
      kind: "first-in-neighbourhood",
      expiresAt: "2099-12-31",
      status: "open",
    });
    await bountyState.recordContributor("b-payout-fail", CONTRIB);
    executeNimiqPayout.mockRejectedValue(new Error("RPC timeout"));

    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      makeRequest({
        bountyId: "b-payout-fail",
        nimiqAddress: "NQ07 TEST0000000000000000000000000000",
        contributorId: CONTRIB,
      }),
    );

    expect(res.status).toBe(500);
    // Raw payout errors are logged server-side but never leaked to callers.
    expect(await res.json()).toEqual({ error: "payout failed — please try again" });
    expect(markBountyPaid).not.toHaveBeenCalled();
  });

  it("extends the claim lock periodically during a long payout", async () => {
    mockBounties.push({
      id: "b-long",
      goal: "Long payout",
      area: "Test area",
      amountUsd: 5,
      rewardNim: 5,
      target: 1,
      progress: 1,
      sponsor: "Test",
      sponsorKind: "community",
      kind: "first-in-neighbourhood",
      expiresAt: "2099-12-31",
      status: "open",
    });
    await bountyState.recordContributor("b-long", CONTRIB);

    vi.useFakeTimers();
    executeNimiqPayout.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ txHash: "0xlong" }), 65_000);
        }),
    );

    const lockSpy = vi.spyOn(bountyState, "tryAcquireClaimLock");
    const extendSpy = vi.spyOn(bountyState, "extendClaimLock");

    const { POST } = await import("@/app/api/bounties/claim/route");
    const reqPromise = POST(
      makeRequest({
        bountyId: "b-long",
        nimiqAddress: "NQ07 LONG0000000000000000000000000000",
        contributorId: CONTRIB,
      }),
    );

    // Wait for the route to acquire the lock and start the refresh interval.
    await vi.advanceTimersByTimeAsync(0);
    const lockToken = await lockSpy.mock.results[0].value;
    await vi.advanceTimersByTimeAsync(65_000);

    const res = await reqPromise;
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      bountyId: "b-long",
      txHash: "0xlong",
    });
    expect(extendSpy).toHaveBeenCalledTimes(2);
    expect(extendSpy).toHaveBeenNthCalledWith(
      1,
      "b-long",
      lockToken,
      { ttlMs: CLAIM_LOCK_TTL_MS },
    );
    expect(extendSpy).toHaveBeenNthCalledWith(
      2,
      "b-long",
      lockToken,
      { ttlMs: CLAIM_LOCK_TTL_MS },
    );
  });

  // ── Contributor eligibility — the payout gate ────────────────────────────
  //
  // These are the regression tests for the hole this rule closes: a filled
  // bounty used to pay any caller who knew its id, regardless of whether they
  // had anything to do with the reading that filled it.

  it("returns 403 when the claimant presents no contributor identity", async () => {
    mockBounties.push(bountyFixture("b-anon"));
    await bountyState.recordContributor("b-anon", CONTRIB);

    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      makeRequest({
        bountyId: "b-anon",
        nimiqAddress: nq("anon"),
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "claim requires the contributor identity that completed this bounty",
    });
    expect(executeNimiqPayout).not.toHaveBeenCalled();
  });

  it("returns 403 for a filled bounty with no attributed contributors", async () => {
    mockBounties.push(bountyFixture("b-unattributed", { progress: 1, target: 1 }));

    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      makeRequest({
        bountyId: "b-unattributed",
        nimiqAddress: nq("unattributed"),
        contributorId: CONTRIB,
      }),
    );

    // Failing closed is deliberate: an unattributed bounty is precisely the
    // old, exploitable state, so it must not be payable.
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "this bounty has no attributed contributors and cannot be claimed",
    });
    expect(executeNimiqPayout).not.toHaveBeenCalled();
  });

  it("returns 403 when the claimant did not contribute to the bounty", async () => {
    mockBounties.push(bountyFixture("b-not-mine"));
    await bountyState.recordContributor("b-not-mine", "contrib-someone-else1");

    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      makeRequest({
        bountyId: "b-not-mine",
        nimiqAddress: nq("attacker"),
        contributorId: CONTRIB,
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "only a contributor to this bounty can claim it",
    });
    expect(executeNimiqPayout).not.toHaveBeenCalled();
  });

  it("claims a filled bounty in the `claiming` state", async () => {
    // `update-bounty-progress` flips completed bounties to `claiming`. Requiring
    // `open` here previously made every genuinely completed Base44 bounty
    // permanently unclaimable.
    mockBounties.push(bountyFixture("b-claiming", { status: "claiming" }));
    await bountyState.recordContributor("b-claiming", CONTRIB);

    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      makeRequest({
        bountyId: "b-claiming",
        nimiqAddress: nq("claiming"),
        contributorId: CONTRIB,
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, bountyId: "b-claiming" });
  });

  it("pays a wallet-bound contributor to their own wallet", async () => {
    const wallet = nq("author");
    mockBounties.push(bountyFixture("b-bound"));
    await bountyState.recordContributor("b-bound", wallet);

    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      makeRequest({
        bountyId: "b-bound",
        nimiqAddress: wallet,
        contributorId: wallet,
      }),
    );

    expect(res.status).toBe(200);
    expect(executeNimiqPayout).toHaveBeenCalledWith(wallet, 5);
  });

  it("refuses to redirect a wallet-bound contributor's payout elsewhere", async () => {
    // The key property of the rule: knowing another contributor's id lets you
    // *trigger* their payout, never divert it.
    const author = nq("author");
    const attacker = nq("attacker");
    mockBounties.push(bountyFixture("b-bound-redirect"));
    await bountyState.recordContributor("b-bound-redirect", author);

    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      makeRequest({
        bountyId: "b-bound-redirect",
        nimiqAddress: attacker,
        contributorId: author,
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "payout must go to the wallet that completed this bounty",
    });
    expect(executeNimiqPayout).not.toHaveBeenCalled();
  });
});
