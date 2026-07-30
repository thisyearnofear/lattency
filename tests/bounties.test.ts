import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConfig = { base44Configured: false };
const mockB44 = {
  b44MarkBountyPaid: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
};
const bountyCreate = vi.fn();

vi.mock("@/lib/base44", () => ({
  get base44Configured() {
    return mockConfig.base44Configured;
  },
  getBase44: () => ({ entities: { Bounty: { create: bountyCreate } } }),
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

    const { __resetBountyStateForTests } = await import("@/lib/bounties");
    await __resetBountyStateForTests();
  });

  describe("markBountyPaid (in-memory fallback)", () => {
    it("marks a fallback bounty as paid without touching Base44", async () => {
      const { markBountyPaid, getBounties } = await import("@/lib/bounties");

      await markBountyPaid("b-shoreditch-first", "NQ07 ABC123", "0xabc");

      const bounties = await getBounties("london");
      expect(bounties.find((b) => b.id === "b-shoreditch-first")).toBeUndefined();
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

      await markBountyPaid("b-shoreditch-first", "NQ07 ABC123", "0xabc");
      await markBountyPaid("b-shoreditch-first", "NQ07 ABC123", "0xabc");

      const bounties = await getBounties("london");
      expect(bounties.find((b) => b.id === "b-shoreditch-first")).toBeUndefined();
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

      await markBountyPaid("b-shoreditch-first", "NQ07 ABC123", "0x789");

      expect(mockB44.b44MarkBountyPaid).not.toHaveBeenCalled();
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
