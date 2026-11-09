import { describe, it, expect, vi } from "vitest";
import { listCafesHandler } from "@/base44/shared/list-cafes-handler";

interface FakeCafe {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  [k: string]: unknown;
}

interface FakeMeasurement {
  cafe_id: string;
  down_mbps: number;
  up_mbps: number;
  latency_ms: number;
  measured_at: string;
  is_outlier?: boolean | null;
  photo_url?: string | null;
  [k: string]: unknown;
}

function req(body: unknown) {
  return new Request("http://x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function cafe(id: string, over: Partial<FakeCafe> = {}): FakeCafe {
  return {
    id,
    name: `Cafe ${id}`,
    latitude: 51.5,
    longitude: -0.1,
    city: "london",
    ...over,
  };
}

function measurement(
  cafeId: string,
  downMbps: number,
  measuredAt: string,
  over: Partial<FakeMeasurement> = {},
): FakeMeasurement {
  return {
    cafe_id: cafeId,
    down_mbps: downMbps,
    up_mbps: 5,
    latency_ms: 20,
    measured_at: measuredAt,
    ...over,
  };
}

function makeClient(
  cafes: FakeCafe[],
  measurementsByCafe: Record<string, FakeMeasurement[]>,
) {
  const cafeList = vi.fn().mockResolvedValue(cafes);
  const measFilter = vi
    .fn()
    .mockImplementation((q: Record<string, unknown>) =>
      Promise.resolve(measurementsByCafe[q.cafe_id as string] ?? []),
    );
  const client = {
    asServiceRole: {
      entities: {
        Cafe: { list: cafeList },
        Measurement: { filter: measFilter },
      },
    },
  };
  return { client, cafeList, measFilter };
}

async function stations(res: Response) {
  const body = (await res.json()) as { cafes: Array<Record<string, unknown>> };
  return body.cafes;
}

describe("listCafesHandler", () => {
  it("fetches each candidate cafe's own 500-measurement window", async () => {
    const { client, cafeList, measFilter } = makeClient(
      [cafe("a"), cafe("b")],
      {
        a: [measurement("a", 60, "2025-01-02T00:00:00Z")],
        b: [measurement("b", 20, "2025-01-02T00:00:00Z")],
      },
    );

    const res = await listCafesHandler(req({ city: "london" }), () => client);

    expect(res.status).toBe(200);
    expect(cafeList).toHaveBeenCalledWith("-created_date", 5000, 0);
    expect(measFilter).toHaveBeenCalledTimes(2);
    expect(measFilter).toHaveBeenCalledWith({ cafe_id: "a" }, "-measured_at", 500, 0);
    expect(measFilter).toHaveBeenCalledWith({ cafe_id: "b" }, "-measured_at", 500, 0);
  });

  it("gives a quiet cafe its stats regardless of how busy the network is", async () => {
    // Regression for the global-window bug: a shared 5000-measurement pool
    // let busy cafes crowd quieter ones out. With per-cafe windows the quiet
    // cafe always gets its own readings back.
    const busy = Array.from({ length: 500 }, (_, i) =>
      measurement("busy", 80, `2025-02-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`),
    );
    const { client } = makeClient([cafe("busy"), cafe("quiet")], {
      busy,
      quiet: [
        measurement("quiet", 12, "2025-01-01T00:00:00Z"),
        measurement("quiet", 14, "2025-01-03T00:00:00Z"),
        measurement("quiet", 16, "2025-01-02T00:00:00Z"),
      ],
    });

    const list = await stations(await listCafesHandler(req({ city: "london" }), () => client));
    const quiet = list.find((s) => s.id === "quiet");

    expect(quiet).toBeDefined();
    expect(quiet!.measurementCount).toBe(3);
    expect(quiet!.medianDownMbps).toBe(14);
    expect(quiet!.tier).toBe("local");
  });

  it("exposes lastReadingAt as the newest measured_at, null when empty", async () => {
    const { client } = makeClient([cafe("a"), cafe("empty")], {
      a: [
        // Sorted -measured_at by the backend: index 0 is newest.
        measurement("a", 60, "2025-03-05T00:00:00Z"),
        measurement("a", 55, "2025-03-01T00:00:00Z"),
      ],
    });

    const list = await stations(await listCafesHandler(req({ city: "london" }), () => client));

    expect(list.find((s) => s.id === "a")!.lastReadingAt).toBe("2025-03-05T00:00:00Z");
    expect(list.find((s) => s.id === "empty")!.lastReadingAt).toBeNull();
  });

  it("uses the clean median when >=3 non-outlier readings, all readings otherwise", async () => {
    const { client } = makeClient([cafe("cleaned"), cafe("thin")], {
      cleaned: [
        measurement("cleaned", 10, "2025-01-01T00:00:00Z"),
        measurement("cleaned", 20, "2025-01-02T00:00:00Z"),
        measurement("cleaned", 30, "2025-01-03T00:00:00Z"),
        measurement("cleaned", 999, "2025-01-04T00:00:00Z", { is_outlier: true }),
      ],
      thin: [
        measurement("thin", 10, "2025-01-01T00:00:00Z"),
        measurement("thin", 30, "2025-01-02T00:00:00Z"),
        measurement("thin", 999, "2025-01-03T00:00:00Z", { is_outlier: true }),
      ],
    });

    const list = await stations(await listCafesHandler(req({ city: "london" }), () => client));

    // 3 clean readings -> median of [10, 20, 30], not of all four (25).
    expect(list.find((s) => s.id === "cleaned")!.medianDownMbps).toBe(20);
    // Only 2 clean readings -> falls back to all three -> median 30.
    expect(list.find((s) => s.id === "thin")!.medianDownMbps).toBe(30);
  });

  it("applies the city filter before fetching measurements", async () => {
    const { client, measFilter } = makeClient(
      [cafe("lon", { city: "london" }), cafe("nbo", { city: "nairobi" }), cafe("none", { city: null })],
      {},
    );

    await listCafesHandler(req({ city: "london" }), () => client);

    // "none" defaults to nairobi server-side, so only lon is a candidate.
    expect(measFilter).toHaveBeenCalledTimes(1);
    expect(measFilter).toHaveBeenCalledWith({ cafe_id: "lon" }, "-measured_at", 500, 0);
  });

  it("caps the per-cafe fan-out at 200 candidates in list order", async () => {
    // -created_date order is what Cafe.list returns; interleave a few
    // nairobi cafes to prove the city filter runs before the cap.
    const cafes = [
      cafe("nbo-1", { city: "nairobi" }),
      ...Array.from({ length: 205 }, (_, i) => cafe(`lon-${i}`)),
      cafe("nbo-2", { city: "nairobi" }),
    ];
    const { client, measFilter } = makeClient(cafes, {});

    const res = await listCafesHandler(req({ city: "london" }), () => client);
    const list = await stations(res);

    expect(measFilter).toHaveBeenCalledTimes(200);
    const queried = new Set(measFilter.mock.calls.map((c) => (c[0] as { cafe_id: string }).cafe_id));
    expect(queried.has("nbo-1")).toBe(false);
    expect(queried.has("nbo-2")).toBe(false);
    expect(queried.has("lon-0")).toBe(true);
    expect(queried.has("lon-199")).toBe(true);
    expect(queried.has("lon-204")).toBe(false);
    expect(list.length).toBe(200);
  });

  it("keeps the geo radius cut and distance ordering", async () => {
    const { client } = makeClient(
      [
        cafe("near", { latitude: 51.5005, longitude: -0.1 }),
        cafe("far", { latitude: 0, longitude: 0 }),
        cafe("mid", { latitude: 51.501, longitude: -0.1 }),
      ],
      {},
    );

    const res = await listCafesHandler(
      req({ lat: 51.5, lng: -0.1, radiusM: 300 }),
      () => client,
    );
    const list = await stations(res);

    expect(list.map((s) => s.id)).toEqual(["near", "mid"]);
  });

  it("returns a 500 response when the backend client fails", async () => {
    const res = await listCafesHandler(req({ city: "london" }), () => {
      throw new Error("backend down");
    });
    expect(res.status).toBe(500);
  });
});
