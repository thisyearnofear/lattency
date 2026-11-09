import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { BOUNTY_PAYMENTS_PAUSED } from "@/lib/bounty-policy";

// The REAL bounty-policy module is exercised here (unlike the route suites,
// which mock it enabled). Its gate is env-driven, so every test stubs the
// exact configuration it wants — see tests/setup.ts, which clears the
// payment envs that .env.local leaks in on a configured machine.

const createBounty = vi.fn();
const getBounties = vi.fn().mockResolvedValue([]);
const markBountyPaid = vi.fn();
const executeNimiqPayout = vi.fn();
const nimiqRpcCall = vi.fn();
const checkRateLimit = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/bounties", () => ({
  createBounty: (...args: unknown[]) => createBounty(...args),
  getBounties: (...args: unknown[]) => getBounties(...args),
  markBountyPaid: (...args: unknown[]) => markBountyPaid(...args),
}));

vi.mock("@/lib/nimiq-payout", () => ({
  executeNimiqPayout: (...args: unknown[]) => executeNimiqPayout(...args),
  nimiqRpcCall: (...args: unknown[]) => nimiqRpcCall(...args),
  getNimiqRpcUrl: () => "http://localhost:8648",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  hashIp: () => "ip-hash",
}));

const ESCROW = "NQ26 5SK4 DC9A R1EX 1BQH 35Y0 EADX BSBR BJU0";
const KEY = "ab".repeat(32);
const TX_HASH = "b".repeat(64);

function jsonRequest(url: string, body: string): NextRequest {
  return new NextRequest(url, { method: "POST", body });
}

function validBountyBody(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    goal: "Fill the gap",
    area: "Shoreditch",
    target: 1,
    rewardNim: 5,
    sponsor: "Test sponsor",
    sponsorKind: "community",
    kind: "tier-target",
    fundingTxHash: TX_HASH,
    clientIntentId: "intent-1",
    ...over,
  });
}

const validClaimBody = JSON.stringify({
  bountyId: "b-1",
  nimiqAddress: "NQ" + "A".repeat(38),
  contributorId: "contrib-test-1234-abcd",
});

/** Stub every env the policy reads to empty — the fail-closed baseline. */
function stubUnconfigured() {
  vi.stubEnv("BOUNTY_DISABLE", "");
  vi.stubEnv("NIMIQ_PAYOUT_MOCK", "");
  vi.stubEnv("NIMIQ_ESCROW_ADDRESS", "");
  vi.stubEnv("NIMIQ_PRIVATE_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_NIMIQ_ESCROW_ADDRESS", "");
}

function stubRealConfig() {
  stubUnconfigured();
  vi.stubEnv("NIMIQ_ESCROW_ADDRESS", ESCROW);
  vi.stubEnv("NIMIQ_PRIVATE_KEY", KEY);
}

/** An RPC response for an executed tx paying `value` lunas to `recipient`. */
function executedTx(recipient: string, value: number) {
  return {
    data: {
      hash: TX_HASH,
      blockNumber: 12345,
      state: "included",
      recipient,
      from: "NQ07 SPONSOR000000000000000000000000000",
      value,
    },
  };
}

describe("bounty payment policy gate (env-gated, fail-closed)", () => {
  beforeEach(() => {
    createBounty.mockReset();
    getBounties.mockReset().mockResolvedValue([]);
    markBountyPaid.mockClear();
    executeNimiqPayout.mockClear();
    nimiqRpcCall.mockReset();
    checkRateLimit.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // ── Paused ─────────────────────────────────────────────────────────────

  it("returns 503 paused when payment envs are unconfigured", async () => {
    stubUnconfigured();
    const { POST } = await import("@/app/api/bounties/route");
    const res = await POST(
      jsonRequest("http://localhost/api/bounties", validBountyBody()),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe("BOUNTY_PAYMENTS_PAUSED");
    expect(body.error).toBe(BOUNTY_PAYMENTS_PAUSED);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(createBounty).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("returns 503 paused with only a partial config (key without escrow, escrow without key)", async () => {
    const { POST } = await import("@/app/api/bounties/route");

    stubUnconfigured();
    vi.stubEnv("NIMIQ_PRIVATE_KEY", KEY);
    let res = await POST(
      jsonRequest("http://localhost/api/bounties", validBountyBody()),
    );
    expect(res.status).toBe(503);

    stubUnconfigured();
    vi.stubEnv("NIMIQ_ESCROW_ADDRESS", ESCROW);
    res = await POST(
      jsonRequest("http://localhost/api/bounties", validBountyBody()),
    );
    expect(res.status).toBe(503);
    expect(createBounty).not.toHaveBeenCalled();
  });

  it("BOUNTY_DISABLE=1 re-pauses even with a complete real config", async () => {
    stubRealConfig();
    vi.stubEnv("BOUNTY_DISABLE", "1");
    const { POST } = await import("@/app/api/bounties/route");
    const res = await POST(
      jsonRequest("http://localhost/api/bounties", validBountyBody()),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("BOUNTY_PAYMENTS_PAUSED");
    expect(createBounty).not.toHaveBeenCalled();
    expect(nimiqRpcCall).not.toHaveBeenCalled();
  });

  it("BOUNTY_DISABLE=1 re-pauses even in mock mode", async () => {
    stubUnconfigured();
    vi.stubEnv("NIMIQ_PAYOUT_MOCK", "1");
    vi.stubEnv("BOUNTY_DISABLE", "1");
    const { POST } = await import("@/app/api/bounties/route");
    const res = await POST(
      jsonRequest("http://localhost/api/bounties", validBountyBody()),
    );
    expect(res.status).toBe(503);
    expect(createBounty).not.toHaveBeenCalled();
  });

  it("returns 503 paused before parsing, even for malformed JSON", async () => {
    stubUnconfigured();
    const { POST } = await import("@/app/api/bounties/route");
    const res = await POST(
      jsonRequest("http://localhost/api/bounties", "not-json{{{"),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("BOUNTY_PAYMENTS_PAUSED");
  });

  it("POST /api/bounties/claim returns 503 paused before parsing or eligibility", async () => {
    stubRealConfig();
    vi.stubEnv("BOUNTY_DISABLE", "1");
    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      jsonRequest("http://localhost/api/bounties/claim", validClaimBody),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("BOUNTY_PAYMENTS_PAUSED");
    expect(executeNimiqPayout).not.toHaveBeenCalled();
    expect(getBounties).not.toHaveBeenCalled();
    expect(markBountyPaid).not.toHaveBeenCalled();
  });

  it("the real executeNimiqPayout rejects paused without touching the network", async () => {
    stubUnconfigured();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const real = await vi.importActual<typeof import("@/lib/nimiq-payout")>(
      "@/lib/nimiq-payout",
    );
    await expect(
      real.executeNimiqPayout("NQ" + "A".repeat(38), 5),
    ).rejects.toThrow(BOUNTY_PAYMENTS_PAUSED);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the real executeNimiqPayout stays paused under BOUNTY_DISABLE even in mock mode", async () => {
    stubUnconfigured();
    vi.stubEnv("NIMIQ_PAYOUT_MOCK", "1");
    vi.stubEnv("BOUNTY_DISABLE", "1");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const real = await vi.importActual<typeof import("@/lib/nimiq-payout")>(
      "@/lib/nimiq-payout",
    );
    await expect(
      real.executeNimiqPayout("NQ" + "A".repeat(38), 5),
    ).rejects.toThrow(BOUNTY_PAYMENTS_PAUSED);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── Enabled ────────────────────────────────────────────────────────────

  it("NIMIQ_PAYOUT_MOCK=1 alone enables the dev path end to end", async () => {
    stubUnconfigured();
    vi.stubEnv("NIMIQ_PAYOUT_MOCK", "1");
    createBounty.mockImplementation((input: Record<string, unknown>) =>
      Promise.resolve({ id: "b-new", ...input }),
    );

    const { POST } = await import("@/app/api/bounties/route");
    const res = await POST(
      jsonRequest("http://localhost/api/bounties", validBountyBody()),
    );

    expect(res.status).toBe(201);
    // Mock-mode verification short-circuits but still normalizes the hash.
    expect(createBounty).toHaveBeenCalledWith(
      expect.objectContaining({
        fundingTxHash: TX_HASH,
        clientIntentId: "intent-1",
        fundingStatus: "verified",
      }),
    );
    expect(nimiqRpcCall).not.toHaveBeenCalled();
  });

  it("real config (escrow + key) enables creation against a verified on-chain tx", async () => {
    stubRealConfig();
    nimiqRpcCall.mockResolvedValue(executedTx(ESCROW, 600_000));
    createBounty.mockImplementation((input: Record<string, unknown>) =>
      Promise.resolve({ id: "b-new", ...input }),
    );

    const { POST } = await import("@/app/api/bounties/route");
    const res = await POST(
      jsonRequest(
        "http://localhost/api/bounties",
        validBountyBody({ fundingTxHash: `0x${TX_HASH}` }),
      ),
    );

    expect(res.status).toBe(201);
    // The RPC saw the canonical bare-hex form, and the stored hash matches it
    // — "0x…" and "…" are the same deposit for the replay guard.
    expect(nimiqRpcCall).toHaveBeenCalledWith("getTransactionByHash", [TX_HASH]);
    expect(createBounty).toHaveBeenCalledWith(
      expect.objectContaining({
        fundingTxHash: TX_HASH,
        fundingStatus: "verified",
      }),
    );
  });

  it("enabled config still rejects an unverifiable funding tx with 400", async () => {
    stubRealConfig();
    // RPC answers the hash with a "Transaction not found" error — the client
    // supplied a bad proof, not an infra failure.
    nimiqRpcCall.mockRejectedValue(
      new Error("RPC getTransactionByHash error: Internal error — Transaction not found"),
    );

    const { POST } = await import("@/app/api/bounties/route");
    const res = await POST(
      jsonRequest("http://localhost/api/bounties", validBountyBody()),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("tx-not-found");
    expect(createBounty).not.toHaveBeenCalled();
  });

  it("the real executeNimiqPayout pays in mock mode once enabled", async () => {
    stubUnconfigured();
    vi.stubEnv("NIMIQ_PAYOUT_MOCK", "1");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const real = await vi.importActual<typeof import("@/lib/nimiq-payout")>(
      "@/lib/nimiq-payout",
    );
    const recipient = "NQ" + "B".repeat(38);
    const result = await real.executeNimiqPayout(recipient, 5);
    expect(result).toMatchObject({
      status: "paid",
      recipient,
      amountLunas: 500_000,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
