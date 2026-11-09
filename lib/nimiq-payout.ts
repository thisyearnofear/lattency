// @nimiq/core loads a WASM binary. Importing it lazily (only inside
// executeNimiqPayout when a real payout is needed) keeps it out of the
// build-time page-data collection, which otherwise fails resolving the
// WASM asset. Mock mode never touches it.
import { log } from "./log";
import { bountyPaymentsEnabled, BOUNTY_PAYMENTS_PAUSED } from "./bounty-policy";

const LUNAS_PER_NIM = 100_000;

export interface PayoutResult {
  txHash: string;
  status: "paid";
  amountLunas: number;
  recipient: string;
}

// Nimiq PoS (Albatross) network ids, from nimiq-primitives networks.rs.
// These are NOT sequential: the signature commits to the id, so a wrong id
// produces a transaction the mempool accepts at broadcast then silently
// drops. Testnet funding txs on-chain show networkId 5.
const NETWORK_IDS: Record<string, number> = {
  mainnet: 24, // MainAlbatross
  testnet: 5, // TestAlbatross
  devnet: 6, // DevAlbatross
};

// Exported for lib/nimiq-verify.ts, which resolves the same endpoint to read
// funding transactions back off the chain.
function getNetworkId(): number {
  if (process.env.NIMIQ_NETWORK_ID) {
    return Number(process.env.NIMIQ_NETWORK_ID);
  }
  const network = process.env.NIMIQ_NETWORK ?? "testnet";
  const id = NETWORK_IDS[network];
  if (id === undefined) {
    throw new Error(`Unknown Nimiq network: ${network}`);
  }
  return id;
}

export function getNimiqRpcUrl(): string {
  return (
    process.env.NIMIQ_RPC_URL ??
    (getNetworkId() === NETWORK_IDS.mainnet
      ? "https://rpc.nimiqwatch.com/"
      : "https://rpc.testnet.nimiqwatch.com/")
  );
}

export async function nimiqRpcCall(
  method: string,
  params: unknown[] = [],
): Promise<unknown> {
  const url = getNimiqRpcUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`RPC ${method} failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    error?: { message: string; data?: unknown };
    result?: unknown;
  };
  if (data.error) {
    // Nimiq Watch puts the real reason in `error.data` (e.g.
    // "Transaction not found: <hash>" under a generic "Internal error").
    const detail = data.error.data;
    throw new Error(
      `RPC ${method} error: ${data.error.message}${detail != null ? ` — ${String(detail)}` : ""}`,
    );
  }
  return data.result;
}

async function getCurrentHeight(): Promise<number> {
  for (const method of ["getBlockNumber", "blockNumber"]) {
    try {
      const result = await nimiqRpcCall(method);
      // Nimiq Watch RPC wraps results in `{ data: ... }`.
      const value =
        result && typeof result === "object" && "data" in result
          ? (result as { data: unknown }).data
          : result;
      if (typeof value === "number") return value;
    } catch (err) {
      log.warn("nimiq rpc height failed", {
        scope: "nimiq.payout",
        method,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw new Error("Could not fetch current Nimiq block height from RPC");
}

function isMockMode(): boolean {
  if (process.env.NIMIQ_PAYOUT_MOCK === "1") return true;
  return !process.env.NIMIQ_PRIVATE_KEY;
}

function mockPayout(
  recipient: string,
  amountNim: number,
  amountLunas: number,
): PayoutResult {
  const txHash = `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("")}`;

  log.info("nimiq payout executed (mock)", {
    scope: "nimiq.payout",
    recipient,
    amountNim,
    amountLunas,
    txHash,
  });

  return { txHash, status: "paid", amountLunas, recipient };
}

/**
 * Execute a NIM payout to a contributor.
 *
 * If `NIMIQ_PRIVATE_KEY` is set and `NIMIQ_PAYOUT_MOCK` is not `1`, the
 * function signs a real Nimiq basic transaction with @nimiq/core and broadcasts
 * it via the RPC endpoint configured by `NIMIQ_RPC_URL`.
 *
 * If no private key is configured (or `NIMIQ_PAYOUT_MOCK=1`), it falls back to
 * a deterministic mock payout so local development and tests keep working.
 */
export async function executeNimiqPayout(
  recipient: string,
  amountNim: number,
): Promise<PayoutResult> {
  if (!bountyPaymentsEnabled()) {
    throw new Error(BOUNTY_PAYMENTS_PAUSED);
  }
  if (!recipient || !recipient.startsWith("NQ")) {
    throw new Error("Invalid Nimiq recipient address");
  }
  if (!Number.isFinite(amountNim) || amountNim <= 0) {
    throw new Error("Payout amount must be a positive number of NIM");
  }

  const amountLunas = Math.floor(amountNim * LUNAS_PER_NIM);

  if (isMockMode()) {
    // Keep UX timing identical to a real broadcast so callers don't need to
    // special-case the fallback.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return mockPayout(recipient, amountNim, amountLunas);
  }

  const privateKeyHex = process.env.NIMIQ_PRIVATE_KEY;
  if (!privateKeyHex) {
    // Defensive: isMockMode() already checks this, but keep the guard explicit.
    throw new Error("NIMIQ_PRIVATE_KEY is not configured");
  }

  try {
    // Lazy-load the WASM-backed SDK only for real payouts.
    const nimiq = await import("@nimiq/core");
    const { Address, KeyPair, PrivateKey, Transaction, AccountType } = nimiq;
    const privateKey = PrivateKey.fromHex(privateKeyHex);
    const keyPair = KeyPair.derive(privateKey);
    const senderAddr = keyPair.publicKey.toAddress();
    const recipientAddr = Address.fromUserFriendlyAddress(recipient);
    const networkId = getNetworkId();
    const height = await getCurrentHeight();

    const tx = new Transaction(
      senderAddr,
      AccountType.Basic,
      new Uint8Array(0),
      recipientAddr,
      AccountType.Basic,
      new Uint8Array(0),
      BigInt(amountLunas),
      BigInt(0),
      0,
      height,
      networkId,
    );

    keyPair.signTransaction(tx);
    // Offline sanity before broadcast: the mempool silently drops invalid
    // transactions (bad signature, wrong network id, sender == recipient),
    // and sendRawTransaction still returns a hash for them. verify() throws
    // synchronously here instead of letting the payout vanish on-chain.
    tx.verify(networkId);
    const txHex = tx.toHex();

    const sendResult = await nimiqRpcCall("sendRawTransaction", [txHex]);
    const txHash =
      sendResult && typeof sendResult === "object" && "data" in sendResult
        ? String((sendResult as { data: string }).data)
        : tx.hash();
    log.info("nimiq payout executed", {
      scope: "nimiq.payout",
      recipient,
      amountNim,
      amountLunas,
      txHash,
      networkId,
    });

    return { txHash, status: "paid", amountLunas, recipient };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.error("nimiq payout failed", { scope: "nimiq.payout", reason });
    throw err;
  }
}
