import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyFundingTx } from "@/lib/nimiq-verify";

const ESCROW = "NQ26 5SK4 DC9A R1EX 1BQH 35Y0 EADX BSBR BJU0";
const HASH = `0x${"a".repeat(64)}`;

/** A Nimiq RPC response body for getTransactionByHash. */
function rpcResult(result: unknown) {
  return {
    ok: true,
    json: async () => ({ jsonrpc: "2.0", id: 1, result }),
  } as Response;
}

const fetchMock = vi.fn();

describe("verifyFundingTx", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NIMIQ_PAYOUT_MOCK", "");
    vi.stubEnv("NIMIQ_PRIVATE_KEY", "deadbeef".repeat(8));
    vi.stubEnv("NIMIQ_RPC_URL", "http://localhost:8648");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("bypasses the network entirely in mock mode", async () => {
    vi.stubEnv("NIMIQ_PAYOUT_MOCK", "1");
    vi.stubEnv("NIMIQ_PRIVATE_KEY", "");

    const res = await verifyFundingTx(HASH, 500_000, ESCROW);

    // The returned hash is the canonical bare-hex form — "0x" is stripped so
    // the stored fundingTxHash matches regardless of how the sponsor sent it.
    expect(res).toEqual({ ok: true, txHash: "a".repeat(64) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns not-configured without a payout key or escrow, no network", async () => {
    vi.stubEnv("NIMIQ_PRIVATE_KEY", "");
    expect(await verifyFundingTx(HASH, 1, ESCROW)).toEqual({
      ok: false,
      reason: "not-configured",
    });
    expect(await verifyFundingTx(HASH, 1, undefined)).toEqual({
      ok: false,
      reason: "not-configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed tx hash without hitting the RPC", async () => {
    for (const bad of ["", "not-a-hash", "0x1234", `0x${"z".repeat(64)}`]) {
      const res = await verifyFundingTx(bad, 1, ESCROW);
      expect(res).toEqual({ ok: false, reason: "invalid-tx-hash" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts an executed tx paying the escrow at least the minimum", async () => {
    fetchMock.mockResolvedValue(
      rpcResult({
        data: {
          hash: HASH,
          blockNumber: 12345,
          state: "included",
          sender: "NQ07 SENDER000000000000000000000000000",
          recipient: "NQ265SK4DC9AR1EX1BQH35Y0EADXBSBRBJU0",
          value: 600_000,
        },
      }),
    );

    const res = await verifyFundingTx(HASH, 500_000, ESCROW);

    expect(res).toEqual({
      ok: true,
      txHash: "a".repeat(64),
      sender: "NQ07 SENDER000000000000000000000000000",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8648",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("getTransactionByHash"),
      }),
    );
  });

  it("rejects a tx paying a different recipient", async () => {
    fetchMock.mockResolvedValue(
      rpcResult({
        hash: HASH,
        blockNumber: 12345,
        recipient: "NQ99 SOMEONEELSE0000000000000000000000",
        value: 600_000,
      }),
    );

    expect(await verifyFundingTx(HASH, 500_000, ESCROW)).toEqual({
      ok: false,
      reason: "recipient-mismatch",
    });
  });

  it("rejects a tx whose value is under the minimum", async () => {
    fetchMock.mockResolvedValue(
      rpcResult({
        hash: HASH,
        blockNumber: 12345,
        recipient: ESCROW,
        value: 400_000,
      }),
    );

    expect(await verifyFundingTx(HASH, 500_000, ESCROW)).toEqual({
      ok: false,
      reason: "under-funded",
    });
  });

  it("rejects when the RPC returns no transaction", async () => {
    fetchMock.mockResolvedValue(rpcResult(null));

    expect(await verifyFundingTx(HASH, 1, ESCROW)).toEqual({
      ok: false,
      reason: "tx-not-found",
    });
  });

  it("rejects a pending (unexecuted) transaction", async () => {
    fetchMock.mockResolvedValue(
      rpcResult({ hash: HASH, state: "new", recipient: ESCROW, value: 999_999 }),
    );

    expect(await verifyFundingTx(HASH, 1, ESCROW)).toEqual({
      ok: false,
      reason: "tx-not-executed",
    });
  });

  it("maps RPC failures to rpc-error rather than throwing", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));

    expect(await verifyFundingTx(HASH, 1, ESCROW)).toEqual({
      ok: false,
      reason: "rpc-error",
    });
  });
});
