import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CafeStation } from "@/lib/types";

// The seed board derives its progress from the live map, so the station read
// is mocked here: these tests are about how the board is assembled, and a real
// read would make them depend on the bundled catalog's contents.
const getCafes = vi.fn<(opts?: unknown) => Promise<CafeStation[]>>().mockResolvedValue([]);
vi.mock("@/lib/cafes", () => ({
  getCafes: (opts?: unknown) => getCafes(opts),
}));

const mockConfig = { base44Configured: false };
const mockB44 = {
  b44MarkBountyPaid: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
};
const bountyCreate = vi.fn();
const bountyFilter = vi.fn();

vi.mock("@/lib/base44", () => ({
  get base44Configured() {
    return mockConfig.base44Configured;
  },
  getBase44: () => ({
    entities: { Bounty: { create: bountyCreate, filter: bountyFilter } },
  }),
}));

vi.mock("@/lib/base44-data", () => ({
  get b44MarkBountyPaid() {
    return mockB44.b44MarkBountyPaid;
  },
}));

describe("bounties", () => {
  beforeEach(async () => {
    mockConfig.base44Configured = false;
    mockB44.b44MarkBountyPaid.mockReset().mockResolvedValue(true);
    bountyCreate.mockReset().mockResolvedValue({ id: "b44-created-1" });
    // Default: an empty Bounty table, which is what a fresh backend returns.
    bountyFilter.mockReset().mockResolvedValue([]);
    // Default: an empty map, so seeds keep their authored zeros.
    getCafes.mockReset().mockResolvedValue([]);

    const { __resetBountyStateForTests } = await import("@/lib/bounties");
    await __resetBountyStateForTests();
  });

  describe("markBountyPaid (in-memory fallback)", () => {
    it("marks a fallback bounty as paid without touching Base44", async () => {
      const { markBountyPaid, getBounties } = await import("@/lib/bounties");

      await markBountyPaid("b-shoreditch-express-5", "NQ07 ABC123", "0xabc");

      const bounties = await getBounties("london");
      expect(bounties.find((b) => b.id === "b-shoreditch-express-5")).toBeUndefined();
      expect(mockB44.b44MarkBountyPaid).not.toHaveBeenCalled();
    });

    it("marks a created bounty as paid and hides it from getBounties", async () => {
      const { createBounty, markBountyPaid, getBounties } = await import(
        "@/lib/bounties"
      );

      const bounty = await createBounty({
        goal: "Test bounty",
        area: "Test area",
        rewardNim: 10,
        target: 1,
        sponsor: "Test sponsor",
        sponsorKind: "community",
        kind: "first-in-neighbourhood",
        expiresAt: "2099-12-31",
      });

      await markBountyPaid(bounty.id, "NQ07 ABC123", "0xdef");

      const bounties = await getBounties();
      expect(bounties.find((b) => b.id === bounty.id)).toBeUndefined();
      expect(mockB44.b44MarkBountyPaid).not.toHaveBeenCalled();
    });

    it("is idempotent when called twice on the same fallback bounty", async () => {
      const { markBountyPaid, getBounties } = await import("@/lib/bounties");

      await markBountyPaid("b-shoreditch-express-5", "NQ07 ABC123", "0xabc");
      await markBountyPaid("b-shoreditch-express-5", "NQ07 ABC123", "0xabc");

      const bounties = await getBounties("london");
      expect(bounties.find((b) => b.id === "b-shoreditch-express-5")).toBeUndefined();
      expect(mockB44.b44MarkBountyPaid).not.toHaveBeenCalled();
    });
  });

  describe("markBountyPaid (Base44 path)", () => {
    beforeEach(() => {
      mockConfig.base44Configured = true;
    });

    it("calls Base44 for a bounty not in the in-memory stores", async () => {
      const { markBountyPaid } = await import("@/lib/bounties");

      await markBountyPaid("base44-bounty-123", "NQ07 ABC123", "0x123");

      expect(mockB44.b44MarkBountyPaid).toHaveBeenCalledWith(
        "base44-bounty-123",
        "NQ07 ABC123",
        "0x123",
      );
      expect(mockB44.b44MarkBountyPaid).toHaveBeenCalledTimes(1);
    });

    it("still records the bounty as paid when Base44 update fails", async () => {
      const { markBountyPaid, getBounties } = await import("@/lib/bounties");
      mockB44.b44MarkBountyPaid.mockResolvedValue(false);

      await markBountyPaid("base44-fail-123", "NQ07 ABC123", "0x456");

      expect(mockB44.b44MarkBountyPaid).toHaveBeenCalledTimes(1);
      const bounties = await getBounties();
      expect(bounties.find((b) => b.id === "base44-fail-123")).toBeUndefined();
    });

    it("filters a successfully marked Base44 bounty from getBounties", async () => {
      const { markBountyPaid, getBounties } = await import("@/lib/bounties");

      await markBountyPaid("base44-ok-123", "NQ07 ABC123", "0x789");

      expect(mockB44.b44MarkBountyPaid).toHaveBeenCalledTimes(1);
      const bounties = await getBounties();
      expect(bounties.find((b) => b.id === "base44-ok-123")).toBeUndefined();
    });

    it("skips Base44 when the bounty exists in the in-memory stores", async () => {
      const { markBountyPaid } = await import("@/lib/bounties");

      await markBountyPaid("b-shoreditch-express-5", "NQ07 ABC123", "0x789");

      expect(mockB44.b44MarkBountyPaid).not.toHaveBeenCalled();
    });
  });

  // Regression coverage for two coupled bugs: a configured-but-empty Bounty
  // table produced an empty board, and the seed expiries had all passed so the
  // fallback board was empty too. Together they meant the bounty board rendered
  // nothing in every mode, including the offline demo it exists to serve.
  describe("seed board fallback", () => {
    beforeEach(() => {
      mockConfig.base44Configured = true;
    });

    it("serves the seed board when the Bounty table is empty", async () => {
      bountyFilter.mockResolvedValue([]);
      const { getBounties } = await import("@/lib/bounties");

      const bounties = await getBounties();

      expect(bounties.find((b) => b.id === "b-shoreditch-express-5")).toBeDefined();
      expect(bounties.length).toBeGreaterThan(0);
    });

    it("serves the seed board when the read fails", async () => {
      bountyFilter.mockRejectedValue(new Error("503"));
      const { getBounties } = await import("@/lib/bounties");

      const bounties = await getBounties();

      expect(bounties.find((b) => b.id === "b-shoreditch-express-5")).toBeDefined();
    });

    it("prefers live rows once any sponsor bounty exists", async () => {
      // All-or-nothing by design: offering unfunded examples alongside real
      // funded ones would promise money nobody has committed.
      bountyFilter.mockResolvedValue([
        {
          id: "b44-live-1",
          title: "Real funded bounty",
          reward: 7,
          target: 1,
          progress: 0,
          status: "open",
          expires_at: "2099-12-31",
        },
      ]);
      const { getBounties } = await import("@/lib/bounties");

      const bounties = await getBounties();

      expect(bounties.map((b) => b.id)).toEqual(["b44-live-1"]);
    });

    it("keeps every seed bounty in the future so the board is never empty", async () => {
      // Seeds carried fixed calendar dates that had all elapsed, so `isExpired`
      // silently filtered the entire board away.
      bountyFilter.mockResolvedValue([]);
      const { getBounties } = await import("@/lib/bounties");

      const today = new Date().toISOString().slice(0, 10);
      const bounties = await getBounties();

      expect(bounties.length).toBe(11);
      for (const bounty of bounties) {
        expect(bounty.expiresAt >= today).toBe(true);
      }
    });
  });

  // The seed board is unfunded, so its progress is derived from the live map
  // rather than authored. Two properties have to hold: the number reflects the
  // map, and nothing about an unfunded example can be mistaken for a payout.
  describe("seed board derivation", () => {
    beforeEach(() => {
      mockConfig.base44Configured = true;
      bountyFilter.mockResolvedValue([]);
    });

    /** Minimal station factory — the derivation reads only a few fields. */
    const station = (overrides: Partial<CafeStation>): CafeStation =>
      ({
        id: "s1",
        name: "Station",
        city: "london",
        neighbourhood: "Shoreditch",
        tier: "express",
        measurementCount: 4,
        ...overrides,
      }) as CafeStation;

    it("marks every seed bounty as unfunded", async () => {
      const { getBounties } = await import("@/lib/bounties");

      const bounties = await getBounties();

      expect(bounties.length).toBe(11);
      expect(bounties.every((b) => b.synthetic === true)).toBe(true);
    });

    it("does not mark a sponsor-created bounty as unfunded", async () => {
      mockConfig.base44Configured = false;
      const { createBounty, getBounties } = await import("@/lib/bounties");

      const created = await createBounty({
        goal: "A funded target",
        area: "Test area · London",
        rewardNim: 10,
        target: 1,
        sponsor: "A sponsor",
        sponsorKind: "community",
        kind: "first-in-neighbourhood",
        expiresAt: "2099-12-31",
      });

      expect(created.synthetic).toBeUndefined();
      const board = await getBounties();
      expect(board.find((b) => b.id === created.id)?.synthetic).toBeUndefined();
    });

    it("derives seed progress from the live map", async () => {
      // Three express stations in Shoreditch, one local, one express elsewhere:
      // only the Shoreditch express three count toward that seed.
      getCafes.mockResolvedValue([
        station({ id: "a", name: "A" }),
        station({ id: "b", name: "B" }),
        station({ id: "c", name: "C" }),
        station({ id: "d", name: "D", tier: "local" }),
        station({ id: "e", name: "E", neighbourhood: "Hoxton" }),
      ]);
      const { getBounties } = await import("@/lib/bounties");

      const bounties = await getBounties();
      const seed = bounties.find((b) => b.id === "b-shoreditch-express-5");

      expect(seed?.progress).toBe(3);
    });

    it("supports a neighbourhood with no stations at all", async () => {
      getCafes.mockResolvedValue([station({ id: "a", name: "A" })]);
      const { getBounties } = await import("@/lib/bounties");

      const bounties = await getBounties();

      expect(bounties.find((b) => b.id === "b-hoxton-express-3")?.progress).toBe(0);
    });

    it("clamps derived progress at the target", async () => {
      // The map can hold more stations than the target asks for; 7/5 would be
      // a nonsense progress reading.
      getCafes.mockResolvedValue(
        Array.from({ length: 7 }, (_, i) => station({ id: `s${i}`, name: `S${i}` })),
      );
      const { getBounties } = await import("@/lib/bounties");

      const bounties = await getBounties();

      expect(bounties.find((b) => b.id === "b-shoreditch-express-5")?.progress).toBe(5);
    });

    it("leaves seeds unfilled when the station read fails", async () => {
      // A failed read must not fabricate completions: an unfilled target is a
      // smaller lie than a board full of "ready" bounties nobody can claim.
      getCafes.mockRejectedValue(new Error("503"));
      const { getBounties } = await import("@/lib/bounties");

      const bounties = await getBounties();

      expect(bounties.every((b) => b.progress === 0)).toBe(true);
    });

    it("does not re-derive a sponsor bounty's stored progress", async () => {
      bountyFilter.mockResolvedValue([
        {
          id: "b44-live-1",
          title: "Real funded bounty",
          reward: 7,
          target: 5,
          progress: 3,
          status: "open",
          expires_at: "2099-12-31",
        },
      ]);
      // Stations that, if misapplied, would push the live row's progress.
      getCafes.mockResolvedValue(
        Array.from({ length: 9 }, (_, i) => station({ id: `s${i}`, name: `S${i}` })),
      );
      const { getBounties } = await import("@/lib/bounties");

      const bounties = await getBounties();

      expect(bounties.map((b) => b.progress)).toEqual([3]);
      // The backend owns a funded bounty's progress — no station read needed.
      expect(getCafes).not.toHaveBeenCalled();
    });

    it("keeps SEED_CRITERIA in step with the seed board", async () => {
      // Guards both directions: a seed added without a criterion would sit at a
      // frozen zero forever, and a stray criterion would be dead data. The
      // criterion kind also has to be the bounty kind, since the derivation
      // switches on it directly.
      const { getBounties, SEED_CRITERIA } = await import("@/lib/bounties");

      const seeds = (await getBounties()).filter((b) => b.synthetic);

      expect(seeds.map((b) => b.id).sort()).toEqual(Object.keys(SEED_CRITERIA).sort());
      for (const seed of seeds) {
        expect(SEED_CRITERIA[seed.id]?.kind).toBe(seed.kind);
      }
    });
  });

  describe("createBounty", () => {
    const input = {
      goal: "Test bounty",
      area: "Test area · London",
      rewardNim: 10,
      target: 1,
      sponsor: "Test sponsor",
      sponsorKind: "community" as const,
      kind: "first-in-neighbourhood" as const,
      expiresAt: "2099-12-31",
    };

    it("stores in-memory when Base44 is unconfigured", async () => {
      const { createBounty, getBounties } = await import("@/lib/bounties");

      const bounty = await createBounty(input);
      expect(bounty.id).toMatch(/^b-/);
      expect(bountyCreate).not.toHaveBeenCalled();

      const bounties = await getBounties();
      expect(bounties.find((b) => b.id === bounty.id)).toBeDefined();
    });

    it("persists to Base44 when configured and uses the returned id", async () => {
      mockConfig.base44Configured = true;
      const { createBounty } = await import("@/lib/bounties");

      const bounty = await createBounty(input);

      expect(bountyCreate).toHaveBeenCalledTimes(1);
      expect(bounty.id).toBe("b44-created-1");
      expect(bounty.city).toBe("london");
    });

    it("falls back to in-memory when Base44 creation fails", async () => {
      mockConfig.base44Configured = true;
      bountyCreate.mockRejectedValueOnce(new Error("boom"));
      const { createBounty, getBounties } = await import("@/lib/bounties");

      const bounty = await createBounty(input);
      expect(bounty.id).toMatch(/^b-/);

      const bounties = await getBounties();
      expect(bounties.find((b) => b.id === bounty.id)).toBeDefined();
    });
  });
});
