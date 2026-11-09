import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
const gatewayInvoke = vi.fn();

vi.mock("@/lib/base44-gateway", () => ({
  getBase44Gateway: () => ({ functions: { invoke: gatewayInvoke } }),
}));

vi.mock("@/lib/base44", () => ({
  getBase44: () => ({ functions: { invoke } }),
  base44Configured: true,
}));

describe("b44ListCafes response validation", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("rejects on a malformed response rather than faking an empty network", async () => {
    invoke.mockResolvedValue({});
    const { b44ListCafes } = await import("@/lib/base44-data");
    await expect(b44ListCafes({})).rejects.toThrow(/Invalid café response/i);
  });

  it("resolves [] for a bare cafes array payload", async () => {
    invoke.mockResolvedValue({ cafes: [] });
    const { b44ListCafes } = await import("@/lib/base44-data");
    await expect(b44ListCafes({})).resolves.toEqual([]);
  });

  it("resolves [] for a data-wrapped cafes array payload", async () => {
    invoke.mockResolvedValue({ data: { cafes: [] } });
    const { b44ListCafes } = await import("@/lib/base44-data");
    await expect(b44ListCafes({})).resolves.toEqual([]);
  });
});

describe("private gateway adapters", () => {
  beforeEach(() => {
    invoke.mockReset();
    gatewayInvoke.mockReset();
  });

  it("inserts a measurement only through the authenticated gateway client", async () => {
    gatewayInvoke.mockResolvedValue({ data: { measurementId: "m1" } });
    const { b44InsertMeasurement } = await import("@/lib/base44-data");
    await expect(b44InsertMeasurement({
      cafeId: "c1", downMbps: 50, upMbps: 10, latencyMs: 20,
      testMethod: "manual",
    })).resolves.toBe("m1");
    expect(gatewayInvoke).toHaveBeenCalledWith("measurement-gateway", {
      action: "insert",
      measurement: expect.objectContaining({
        cafe_id: "c1", down_mbps: 50, test_method: "manual",
      }),
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("creates a cafe through the private client", async () => {
    gatewayInvoke.mockResolvedValue({ cafeId: "c1", measurementId: "m1" });
    const { b44CreateCafe } = await import("@/lib/base44-data");
    const result = await b44CreateCafe({
      cafe: { name: "Cafe" },
      measurement: { cafeId: "", downMbps: 5, upMbps: 1, latencyMs: 20 },
    });
    expect(result).toEqual({ cafeId: "c1", measurementId: "m1" });
    expect(gatewayInvoke).toHaveBeenCalledWith("create-cafe", expect.objectContaining({
      cafe: { name: "Cafe" },
    }));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("creates a bounty through the private gateway", async () => {
    gatewayInvoke.mockResolvedValue({ data: { bountyId: "b-9" } });
    const { b44CreateBounty } = await import("@/lib/base44-data");
    const record = { title: "x", reward: 1, funding_status: "verified" };
    await expect(b44CreateBounty(record)).resolves.toBe("b-9");
    expect(gatewayInvoke).toHaveBeenCalledWith("measurement-gateway", {
      action: "bounty-insert",
      bounty: record,
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects a malformed bounty-insert response rather than faking an id", async () => {
    gatewayInvoke.mockResolvedValue({ data: {} });
    const { b44CreateBounty } = await import("@/lib/base44-data");
    await expect(
      b44CreateBounty({ title: "x", reward: 1, funding_status: "verified" }),
    ).rejects.toThrow(/bounty-insert/);
  });

  it("distinguishes an absent cafe from a malformed gateway response", async () => {
    const { b44GetCafeById } = await import("@/lib/base44-data");
    gatewayInvoke.mockResolvedValueOnce({ cafe: null });
    await expect(b44GetCafeById("missing")).resolves.toBeNull();
    gatewayInvoke.mockResolvedValueOnce({});
    await expect(b44GetCafeById("broken")).rejects.toThrow("Invalid cafe gateway response");
    expect(invoke).not.toHaveBeenCalled();
  });
});
