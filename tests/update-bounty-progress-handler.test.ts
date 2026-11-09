import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateBountyProgressHandler } from "@/base44/shared/update-bounty-progress-handler";

interface FakeBounty {
  id: string;
  status: string;
  kind?: string;
  criteria?: string | null;
  target?: number;
  progress?: number;
  target_city?: string | null;
  target_neighbourhood?: string | null;
  expires_at?: string | null;
  funding_status?: string | null;
  contributing_contributor_ids?: string[] | null;
}

interface FakeMeasurement {
  down_mbps: number;
  is_outlier?: boolean | null;
}

function req(body: unknown) {
  return new Request("http://x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function bounty(id: string, over: Partial<FakeBounty> = {}): FakeBounty {
  return {
    id,
    status: "open",
    kind: "first-in-neighbourhood",
    target: 1,
    progress: 0,
    target_city: "london",
    target_neighbourhood: "Shoreditch",
    expires_at: "2099-12-31",
    ...over,
  };
}

const CAFE = { id: "cafe-1", city: "london", neighbourhood: "Shoreditch" };

/** Build a fake Base44 client + the captured update patches. */
function makeClient(
  bounties: FakeBounty[],
  measurements: FakeMeasurement[] = [],
  cafe: Record<string, unknown> | null = CAFE,
) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const client = {
    asServiceRole: {
      entities: {
        Cafe: { get: vi.fn().mockResolvedValue(cafe) },
        Bounty: {
          filter: vi.fn().mockResolvedValue(bounties),
          update: vi
            .fn()
            .mockImplementation((id: string, patch: Record<string, unknown>) => {
              updates.push({ id, patch });
              // Apply the patch so the fake store behaves like the entity.
              const row = bounties.find((b) => b.id === id);
              if (row) Object.assign(row, patch);
              return Promise.resolve({});
            }),
        },
        Measurement: { filter: vi.fn().mockResolvedValue(measurements) },
      },
    },
  };
  return { client, updates };
}

describe("updateBountyProgressHandler", () => {
  beforeEach(() => vi.useRealTimers());

  it("increments an area-matched funded bounty and flips to claiming at target", async () => {
    const { client } = makeClient([bounty("b-1")]);

    const res = await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1", contributor_id: "contrib-a" }),
      () => client,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(1);
    expect(body.matched).toEqual([{ id: "b-1", progress: 1, target: 1 }]);
    expect(client.asServiceRole.entities.Bounty.update).toHaveBeenCalledWith(
      "b-1",
      expect.objectContaining({ progress: 1, status: "claiming" }),
    );
  });

  it("does not increment on area mismatch", async () => {
    const { client } = makeClient([
      bounty("b-city", { target_city: "nairobi" }),
      bounty("b-hood", { target_neighbourhood: "Hoxton" }),
    ]);

    const res = await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1", contributor_id: "contrib-a" }),
      () => client,
    );

    expect((await res.json()).updated).toBe(0);
    expect(client.asServiceRole.entities.Bounty.update).not.toHaveBeenCalled();
  });

  it("skips expired bounties", async () => {
    const { client } = makeClient([
      bounty("b-expired", { expires_at: "2020-01-01" }),
    ]);

    const res = await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1", contributor_id: "contrib-a" }),
      () => client,
    );

    expect((await res.json()).updated).toBe(0);
    expect(client.asServiceRole.entities.Bounty.update).not.toHaveBeenCalled();
  });

  it("skips unfunded (unverified) bounties", async () => {
    const { client } = makeClient([
      bounty("b-unverified", { funding_status: "unverified" }),
    ]);

    const res = await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1", contributor_id: "contrib-a" }),
      () => client,
    );

    expect((await res.json()).updated).toBe(0);
    expect(client.asServiceRole.entities.Bounty.update).not.toHaveBeenCalled();
  });

  it("counts DISTINCT contributors for nth-contributor bounties", async () => {
    const row = bounty("b-nth", {
      kind: "nth-contributor",
      target: 2,
      progress: 0,
      contributing_contributor_ids: [],
    });
    const { client } = makeClient([row]);

    // Same contributor testing twice: only the first reading counts.
    await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1", contributor_id: "contrib-a" }),
      () => client,
    );
    const second = await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1", contributor_id: "contrib-a" }),
      () => client,
    );
    expect((await second.json()).updated).toBe(0);
    expect(row.progress).toBe(1);

    // A different contributor advances it to target.
    const third = await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1", contributor_id: "contrib-b" }),
      () => client,
    );
    expect((await third.json()).updated).toBe(1);
    expect(row.progress).toBe(2);
    expect(row.status).toBe("claiming");
  });

  it("ignores nth-contributor readings with no contributor identity", async () => {
    const { client } = makeClient([
      bounty("b-nth", { kind: "nth-contributor", target: 2, progress: 0 }),
    ]);

    const res = await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1" }),
      () => client,
    );

    expect((await res.json()).updated).toBe(0);
    expect(client.asServiceRole.entities.Bounty.update).not.toHaveBeenCalled();
  });

  it("counts the same café only once for venue-count kinds", async () => {
    const row = bounty("b-first", {
      kind: "first-in-neighbourhood",
      target: 3,
      progress: 0,
      contributing_contributor_ids: [],
    });
    const { client } = makeClient([row]);

    await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1", contributor_id: "contrib-a" }),
      () => client,
    );
    const again = await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1", contributor_id: "contrib-b" }),
      () => client,
    );

    // A second reading at the SAME café does not advance a count-of-cafés bounty.
    expect((await again.json()).updated).toBe(0);
    expect(row.progress).toBe(1);
  });

  it("never increments past the target", async () => {
    const { client } = makeClient([
      bounty("b-full", { target: 1, progress: 1 }),
      bounty("b-at-cap", {
        kind: "nth-contributor",
        target: 1,
        progress: 1,
        contributing_contributor_ids: ["contrib-x"],
      }),
    ]);

    const res = await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1", contributor_id: "contrib-new" }),
      () => client,
    );

    expect((await res.json()).updated).toBe(0);
    expect(client.asServiceRole.entities.Bounty.update).not.toHaveBeenCalled();
  });

  it("counts tier-target only when the café's median satisfies the tier", async () => {
    const low = bounty("b-tier-low", {
      kind: "tier-target",
      target: 1,
      progress: 0,
      target_neighbourhood: "Shoreditch",
    });
    const { client: slowClient } = makeClient(
      [low],
      [
        { down_mbps: 10 },
        { down_mbps: 20 },
        { down_mbps: 15 },
      ],
    );

    const slowRes = await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1", contributor_id: "contrib-a" }),
      () => slowClient,
    );
    // Median 15 Mbps → "local" — below the default express target.
    expect((await slowRes.json()).updated).toBe(0);

    const high = bounty("b-tier-high", {
      kind: "tier-target",
      target: 1,
      progress: 0,
      target_neighbourhood: "Shoreditch",
    });
    const { client: fastClient, updates } = makeClient(
      [high],
      [
        { down_mbps: 80 },
        { down_mbps: 60 },
        { down_mbps: 70 },
        { down_mbps: 999, is_outlier: true },
      ],
    );
    const fastRes = await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1", contributor_id: "contrib-a" }),
      () => fastClient,
    );
    // Clean median 70 → "express" — counts and completes.
    expect((await fastRes.json()).updated).toBe(1);
    expect(updates[0].patch).toMatchObject({ progress: 1, status: "claiming" });
  });

  it("honours a tier suffix in criteria (tier-target:local)", async () => {
    const row = bounty("b-tier-local", {
      kind: "tier-target",
      criteria: "tier-target:local",
      target: 1,
      progress: 0,
      target_neighbourhood: "Shoreditch",
    });
    const { client } = makeClient([row], [{ down_mbps: 20 }]);

    const res = await updateBountyProgressHandler(
      req({ cafe_id: "cafe-1", contributor_id: "contrib-a" }),
      () => client,
    );

    expect((await res.json()).updated).toBe(1);
  });

  it("extracts cafe/contributor from the entity-event record shape", async () => {
    const { client } = makeClient([bounty("b-evt")]);

    const res = await updateBountyProgressHandler(
      req({
        record: {
          cafe_id: "cafe-1",
          down_mbps: 60,
          contributor_user_id: "contrib-a",
        },
      }),
      () => client,
    );

    expect((await res.json()).updated).toBe(1);
  });

  it("skips when the café is not found", async () => {
    const { client } = makeClient([bounty("b-1")], [], null);

    const res = await updateBountyProgressHandler(
      req({ cafe_id: "ghost" }),
      () => client,
    );

    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(client.asServiceRole.entities.Bounty.update).not.toHaveBeenCalled();
  });
});
