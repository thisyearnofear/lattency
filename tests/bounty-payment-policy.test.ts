import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { BOUNTY_PAYMENTS_PAUSED } from "@/lib/bounty-policy";

const createBounty = vi.fn();
const getBounties = vi.fn().mockResolvedValue([]);
const markBountyPaid = vi.fn();
const executeNimiqPayout = vi.fn();
const checkRateLimit = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/bounties", () => ({
  createBounty: (...args: unknown[]) => createBounty(...args),
  getBounties: (...args: unknown[]) => getBounties(...args),
  markBountyPaid: (...args: unknown[]) => markBountyPaid(...args),
}));

vi.mock("@/lib/nimiq-payout", () => ({
  executeNimiqPayout: (...args: unknown[]) => executeNimiqPayout(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  hashIp: () => "ip-hash",
}));

function jsonRequest(url: string, body: string): NextRequest {
  return new NextRequest(url, { method: "POST", body });
}

const validClaimBody = JSON.stringify({
  bountyId: "b-1",
  nimiqAddress: "NQ" + "A".repeat(38),
  contributorId: "contrib-test-1234-abcd",
});

describe("bounty payment freeze (real policy)", () => {
  beforeEach(() => {
    createBounty.mockClear();
    getBounties.mockClear();
    markBountyPaid.mockClear();
    executeNimiqPayout.mockClear();
    checkRateLimit.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("POST /api/bounties returns 503 paused before any work, even for a valid body", async () => {
    const { POST } = await import("@/app/api/bounties/route");
    const res = await POST(
      jsonRequest(
        "http://localhost/api/bounties",
        JSON.stringify({
          goal: "Fill the gap",
          area: "Shoreditch",
          target: 1,
          rewardNim: 5,
          sponsor: "Test sponsor",
          sponsorKind: "community",
          kind: "tier-target",
        }),
      ),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe("BOUNTY_PAYMENTS_PAUSED");
    expect(body.error).toBe(BOUNTY_PAYMENTS_PAUSED);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(createBounty).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("POST /api/bounties returns 503 paused even for malformed JSON", async () => {
    const { POST } = await import("@/app/api/bounties/route");
    const res = await POST(
      jsonRequest("http://localhost/api/bounties", "not-json{{{"),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("BOUNTY_PAYMENTS_PAUSED");
    expect(createBounty).not.toHaveBeenCalled();
  });

  it("POST /api/bounties/claim returns 503 paused before parsing or eligibility", async () => {
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

  it("POST /api/bounties/claim returns 503 paused even for malformed JSON", async () => {
    const { POST } = await import("@/app/api/bounties/claim/route");
    const res = await POST(
      jsonRequest("http://localhost/api/bounties/claim", "not-json{{{"),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("BOUNTY_PAYMENTS_PAUSED");
  });

  it("the real executeNimiqPayout rejects paused in mock mode without touching the network", async () => {
    vi.stubEnv("NIMIQ_PAYOUT_MOCK", "1");
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

  it("the real executeNimiqPayout rejects paused even without mock mode", async () => {
    vi.stubEnv("NIMIQ_PAYOUT_MOCK", "0");
    vi.stubEnv("NIMIQ_PRIVATE_KEY", "");
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
});
