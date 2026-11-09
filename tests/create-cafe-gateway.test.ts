import { describe, it, expect, vi } from "vitest";
import { createCafeHandler } from "@/base44/shared/create-cafe-handler";

const SECRET = "s".repeat(32);
const H = "x-lattency-server-key";
function req(body: unknown, headers: Record<string, string> = { [H]: SECRET }) {
  return new Request("http://x", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
const VALID = {
  cafe: { name: "Test Cafe", neighbourhood: "N1", latitude: 51.5, longitude: -0.1, id: "INJECTED", ai_summary: "INJECTED" },
  measurement: { down_mbps: 50, up_mbps: 10, latency_ms: 20 },
};
function makeClient(over: Partial<{ createCafeErr: Error; createMeasErr: Error }> = {}) {
  const cafeCreate = vi.fn().mockImplementation(() =>
    over.createCafeErr ? Promise.reject(over.createCafeErr) : Promise.resolve({ id: "c1" }));
  const cafeDelete = vi.fn().mockResolvedValue(undefined);
  const measCreate = vi.fn().mockImplementation(() =>
    over.createMeasErr ? Promise.reject(over.createMeasErr) : Promise.resolve({ id: "m1" }));
  const measFilter = vi.fn().mockResolvedValue([]);
  return { client: { asServiceRole: { entities: { Cafe: { create: cafeCreate, get: vi.fn(), delete: cafeDelete }, Measurement: { create: measCreate, filter: measFilter }, VenueScan: { filter: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn() } } } },
    cafeCreate, cafeDelete, measCreate, measFilter };
}

describe("createCafeHandler", () => {
  it("rejects unauthorized without touching the client", async () => {
    const mk = vi.fn(() => makeClient().client);
    expect((await createCafeHandler(req(VALID, {}), SECRET, mk)).status).toBe(401);
    expect(mk).not.toHaveBeenCalled();
  });
  it("rejects invalid root/cafe/measurement before any writes", async () => {
    for (const body of [null, [], "x", { cafe: null }, { cafe: VALID.cafe, measurement: null },
      { cafe: { ...VALID.cafe, name: "x" }, measurement: VALID.measurement },
      { cafe: VALID.cafe, measurement: { down_mbps: 5, up_mbps: 1, latency_ms: 1, measured_at: "nope" } },
      { cafe: VALID.cafe, measurement: { down_mbps: 5, up_mbps: 1, latency_ms: 1, download_bytes: 1 } }]) {
      const { client, cafeCreate } = makeClient();
      expect((await createCafeHandler(req(body), SECRET, () => client)).status).toBe(400);
      expect(cafeCreate).not.toHaveBeenCalled();
    }
  });
  it("creates allowlisted cafe, drops injected fields, derives manual method", async () => {
    const { client, cafeCreate, measCreate } = makeClient();
    const res = await createCafeHandler(req(VALID), SECRET, () => client);
    expect(res.status).toBe(201);
    const cafeArg = cafeCreate.mock.calls[0][0];
    expect(cafeArg).not.toHaveProperty("id");
    expect(cafeArg).not.toHaveProperty("ai_summary");
    const measArg = measCreate.mock.calls[0][0];
    expect(measArg.test_method).toBe("manual");
    expect(measArg.is_outlier).toBe(false);
  });
  it("rolls back the cafe when the measurement insert fails", async () => {
    const { client, cafeDelete } = makeClient({ createMeasErr: new Error("boom") });
    const res = await createCafeHandler(req(VALID), SECRET, () => client);
    expect(res.status).toBe(503);
    expect(cafeDelete).toHaveBeenCalledWith("c1");
  });
  it("503s generically on SDK failure without leaking", async () => {
    const { client } = makeClient({ createCafeErr: new Error("PRIVATE DETAIL") });
    const res = await createCafeHandler(req(VALID), SECRET, () => client);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("PRIVATE DETAIL");
  });
  it("handles SDK client initialization failure without leaking", async () => {
    const res = await createCafeHandler(req(VALID), SECRET, () => {
      throw new Error("PRIVATE DETAIL");
    });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("PRIVATE DETAIL");
  });
  it("derives browser-auto from consistent metadata", async () => {
    const { client, measCreate } = makeClient();
    const res = await createCafeHandler(req({
      ...VALID,
      measurement: {
        ...VALID.measurement,
        test_method: "manual",
        download_bytes: 10_485_760,
        download_duration_ms: 1677.7216,
      },
    }), SECRET, () => client);
    expect(res.status).toBe(201);
    expect(measCreate.mock.calls[0][0].test_method).toBe("browser-auto");
  });
});
