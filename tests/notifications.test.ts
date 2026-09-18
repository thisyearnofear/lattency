import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Bounty } from "@/lib/bounties";
import type { CafeStation } from "@/lib/types";

// Notifications are computed on read from two sources: the café list (stale
// stations) and the bounty board (expiring / claimable). Both are mocked so
// each trigger can be exercised on its own.
const getCafes = vi.fn<(opts?: unknown) => Promise<CafeStation[]>>().mockResolvedValue([]);
const getBounties = vi.fn<(city?: string) => Promise<Bounty[]>>().mockResolvedValue([]);

vi.mock("@/lib/cafes", () => ({ getCafes: (opts?: unknown) => getCafes(opts) }));
vi.mock("@/lib/bounties", () => ({
  getBounties: (city?: string) => getBounties(city),
}));

function bounty(overrides: Partial<Bounty> = {}): Bounty {
  return {
    id: "b-1",
    goal: "3 express-tier cafés in Hoxton",
    area: "Hoxton · London",
    city: "london",
    amountUsd: 20,
    rewardNim: 20,
    target: 3,
    progress: 3,
    sponsor: "Community Fibre",
    sponsorKind: "isp",
    kind: "tier-target",
    expiresAt: "2099-12-31",
    status: "claiming",
    ...overrides,
  };
}

/** ISO date `days` from today, for expiry-window cases. */
function inDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe("getNotifications", () => {
  beforeEach(() => {
    getCafes.mockReset().mockResolvedValue([]);
    getBounties.mockReset().mockResolvedValue([]);
  });

  it("announces a filled funded bounty as claimable", async () => {
    getBounties.mockResolvedValue([bounty()]);
    const { getNotifications } = await import("@/lib/notifications");

    const notifications = await getNotifications({ city: "london" });

    expect(notifications.map((n) => n.kind)).toEqual(["bounty-claimable"]);
    expect(notifications[0].body).toContain("20 NIM is waiting");
  });

  it("stays silent about a filled unfunded seed", async () => {
    // Derived seed progress can reach the target, but no sponsor staked it —
    // so there is no reward waiting and announcing one would be a lie about
    // money at the exact moment a contributor is most likely to act on it.
    getBounties.mockResolvedValue([bounty({ synthetic: true })]);
    const { getNotifications } = await import("@/lib/notifications");

    const notifications = await getNotifications({ city: "london" });

    expect(notifications).toEqual([]);
  });

  it("does not manufacture expiry urgency for an unfunded seed", async () => {
    getBounties.mockResolvedValue([
      bounty({ synthetic: true, progress: 1, expiresAt: inDays(1) }),
    ]);
    const { getNotifications } = await import("@/lib/notifications");

    const notifications = await getNotifications({ city: "london" });

    expect(notifications).toEqual([]);
  });

  it("still announces a funded bounty expiring within three days", async () => {
    getBounties.mockResolvedValue([bounty({ progress: 1, expiresAt: inDays(1) })]);
    const { getNotifications } = await import("@/lib/notifications");

    const notifications = await getNotifications({ city: "london" });

    expect(notifications.map((n) => n.kind)).toEqual(["bounty-expiring"]);
  });

  it("ignores an unfunded seed long before its expiry", async () => {
    getBounties.mockResolvedValue([bounty({ synthetic: true, progress: 1 })]);
    const { getNotifications } = await import("@/lib/notifications");

    const notifications = await getNotifications({ city: "london" });

    expect(notifications).toEqual([]);
  });
});
