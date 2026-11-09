import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Bounty } from "@/lib/bounties";

// The create route is hard-paused in production (lib/bounty-policy.ts); these
// tests pin the verification flow that runs *beneath* that guard, so the
// policy is mocked enabled — same technique as the claim route tests.
vi.mock("@/lib/bounty-policy", () => ({
  bountyPaymentsEnabled: () => true,
  BOUNTY_PAYMENTS_PAUSED: "paused",
}));

const createBounty = vi.fn();
const getBounties = vi.fn<() => Promise<Bounty[]>>().mockResolvedValue([]);
vi.mock("@/lib/bounties", () => ({
  createBounty: (...args: unknown[]) => createBounty(...args),
  getBounties: () => getBounties(),
}));

const verifyFundingTx = vi.fn();
vi.mock("@/lib/nimiq-verify", () => ({
  verifyFundingTx: (...args: unknown[]) => verifyFundingTx(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  hashIp: () => "ip-hash",
}));

const TX_HASH = `0x${"f".repeat(64)}`;

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/bounties", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function validBody(over: Record<string, unknown> = {}) {
  return {
    goal: "Fund the gap on Cheshire Street",
    area: "Shoreditch · London",
    target: 1,
    rewardNim: 5,
    sponsor: "Test sponsor",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    fundingTxHash: TX_HASH,
    clientIntentId: "intent-123",
    ...over,
  };
}

function bountyFixture(over: Partial<Bounty> = {}): Bounty {
  return {
    id: "b-existing",
    goal: "Existing bounty",
    area: "Shoreditch · London",
    amountUsd: 0.25,
    rewardNim: 5,
    target: 1,
    progress: 0,
    sponsor: "Test sponsor",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    expiresAt: "2099-12-31",
    status: "open",
    ...over,
  };
}

describe("POST /api/bounties funding verification (policy mocked enabled)", () => {
  beforeEach(() => {
    createBounty.mockReset();
    getBounties.mockReset().mockResolvedValue([]);
    verifyFundingTx
      .mockReset()
      .mockResolvedValue({ ok: true, txHash: TX_HASH, sender: "NQ07 SPONSOR" });
  });

  it("400s when fundingTxHash is missing or not a string", async () => {
    const { POST } = await import("@/app/api/bounties/route");

    const missing = validBody();
    delete (missing as Record<string, unknown>).fundingTxHash;
    const res = await POST(post(missing));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/fundingTxHash/);
    expect(verifyFundingTx).not.toHaveBeenCalled();
    expect(createBounty).not.toHaveBeenCalled();
  });

  it("400s when clientIntentId is missing", async () => {
    const { POST } = await import("@/app/api/bounties/route");
    const body = validBody();
    delete (body as Record<string, unknown>).clientIntentId;

    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/clientIntentId/);
    expect(createBounty).not.toHaveBeenCalled();
  });

  it("400s when the funding tx fails verification, and creates nothing", async () => {
    verifyFundingTx.mockResolvedValue({ ok: false, reason: "tx-not-found" });
    const { POST } = await import("@/app/api/bounties/route");

    const res = await POST(post(validBody()));

    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("tx-not-found");
    expect(verifyFundingTx).toHaveBeenCalledWith(
      TX_HASH,
      500_000,
      process.env.NIMIQ_ESCROW_ADDRESS,
    );
    expect(createBounty).not.toHaveBeenCalled();
  });

  it("502s when verification is not configured (infra failure, not client)", async () => {
    verifyFundingTx.mockResolvedValue({ ok: false, reason: "not-configured" });
    const { POST } = await import("@/app/api/bounties/route");

    const res = await POST(post(validBody()));
    expect(res.status).toBe(502);
    expect(createBounty).not.toHaveBeenCalled();
  });

  it("409s when the funding tx hash already backs a live bounty", async () => {
    getBounties.mockResolvedValue([
      bountyFixture({ fundingTxHash: TX_HASH.toUpperCase().replace("0X", "0x") }),
    ]);
    verifyFundingTx.mockResolvedValue({ ok: true, txHash: TX_HASH });
    const { POST } = await import("@/app/api/bounties/route");

    const res = await POST(post(validBody({ clientIntentId: "fresh-intent" })));

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: "funding transaction already used",
      bountyId: "b-existing",
    });
    expect(createBounty).not.toHaveBeenCalled();
  });

  it("returns the existing bounty 200 when the same clientIntentId retries", async () => {
    const existing = bountyFixture({
      clientIntentId: "intent-123",
      fundingTxHash: TX_HASH,
      fundingStatus: "verified",
    });
    getBounties.mockResolvedValue([existing]);
    const { POST } = await import("@/app/api/bounties/route");

    const res = await POST(post(validBody()));

    // Idempotent: the retry must NOT trip the replay guard on its own tx.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.bounty.id).toBe("b-existing");
    expect(verifyFundingTx).not.toHaveBeenCalled();
    expect(createBounty).not.toHaveBeenCalled();
  });

  it("creates a verified bounty 201 on the happy path", async () => {
    createBounty.mockImplementation((input: Record<string, unknown>) =>
      Promise.resolve(bountyFixture({ id: "b-new", ...input })),
    );
    const { POST } = await import("@/app/api/bounties/route");

    const res = await POST(post(validBody()));

    expect(res.status).toBe(201);
    expect(createBounty).toHaveBeenCalledWith(
      expect.objectContaining({
        fundingTxHash: TX_HASH,
        clientIntentId: "intent-123",
        fundingStatus: "verified",
      }),
    );
    const body = await res.json();
    expect(body.bounty.fundingStatus).toBe("verified");
  });

  it("keeps the ambiguous-persistence error when create fails", async () => {
    createBounty.mockRejectedValue(
      new Error(
        "Could not confirm bounty persistence. Do not retry payment; contact support with your transaction reference.",
      ),
    );
    const { POST } = await import("@/app/api/bounties/route");

    const res = await POST(post(validBody()));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Do not retry payment/);
  });
});
