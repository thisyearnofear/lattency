// Funding verification — proves a sponsor's escrow deposit exists on-chain
// before a bounty is trusted as backed.
//
// This is the read-side mirror of lib/nimiq-payout.ts: the payout path signs
// and broadcasts, this path fetches the transaction back via the same Nimiq
// JSON-RPC endpoint and checks three things — the tx executed, its recipient
// is the escrow address, and its value covers the advertised reward. A bounty
// created without all three has no money behind it and must never enter the
// payable pool.
//
// The function never throws. Every failure mode — missing config, malformed
// hash, RPC outage, wrong recipient — returns `{ ok: false, reason }` so the
// caller can map reasons to status codes instead of catching.

import "server-only";
import { log } from "./log";
import { nimiqRpcCall } from "./nimiq-payout";

/** Nimiq tx hashes are 32 bytes shown as 64 hex chars, optionally 0x-prefixed. */
const TX_HASH_RE = /^(0x)?[0-9a-fA-F]{64}$/;

export type FundingVerification =
  | { ok: true; txHash: string; sender?: string }
  | { ok: false; reason: string };

/** Strip grouping spaces and case-fold so "NQ26 5SK4 …" equals "NQ265SK4…". */
function normalizeNimiqAddress(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s/g, "").toUpperCase() : "";
}

/**
 * Nimiq Watch RPC wraps results in `{ data: … }` on some methods and returns
 * the bare object on others — unwrap when the envelope is present.
 */
function unwrap(result: unknown): unknown {
  return result && typeof result === "object" && "data" in result
    ? (result as { data: unknown }).data
    : result;
}

function txField(tx: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (tx[name] !== undefined && tx[name] !== null) return tx[name];
  }
  return undefined;
}

/**
 * Whether the transaction executed on-chain. Different Nimiq RPC flavours
 * surface this differently (`state`, `executed`, `executionResult`, or simply
 * a block assignment), so accept any positive signal and treat a mempool-only
 * transaction — one with none of them — as not yet funded.
 */
function isExecuted(tx: Record<string, unknown>): boolean {
  if (tx.executed === true) return true;
  const state = tx.state;
  if (state === "executed" || state === "included" || state === "confirmed") {
    return true;
  }
  const execResult = tx.executionResult;
  if (
    execResult &&
    typeof execResult === "object" &&
    (execResult as { success?: unknown }).success === true
  ) {
    return true;
  }
  return (
    Number.isFinite(tx.blockNumber) ||
    Number.isFinite(tx.block_number) ||
    typeof tx.blockHash === "string" ||
    typeof tx.block_hash === "string"
  );
}

/**
 * Verify that `txHash` is an executed transaction paying at least `minLunas`
 * to `escrowAddress`.
 *
 * `NIMIQ_PAYOUT_MOCK=1` short-circuits to ok — mock mode is how the whole
 * payment surface runs in dev/tests, and verification follows the same flag
 * so the flow stays exercisable without a funded wallet.
 *
 * Outside mock mode, no network request is made unless the deployment is
 * actually configured to pay out (`NIMIQ_PRIVATE_KEY` set — the same gate the
 * payout path uses) and an escrow address was supplied; either missing yields
 * `{ ok: false, reason: "not-configured" }` rather than a meaningless RPC.
 */
export async function verifyFundingTx(
  txHash: string,
  minLunas: number,
  escrowAddress: string | undefined | null,
): Promise<FundingVerification> {
  const hash = (txHash ?? "").trim();
  // Canonical form: bare lowercase hex. The RPC rejects a 0x prefix, and the
  // bounty board stores/compares this verbatim — normalizing here means
  // "0xABC" and "abc" are the same deposit for the replay guard.
  const normalized = hash.replace(/^0x/i, "").toLowerCase();

  if (process.env.NIMIQ_PAYOUT_MOCK === "1") {
    return { ok: true, txHash: normalized };
  }

  if (!process.env.NIMIQ_PRIVATE_KEY || !escrowAddress?.trim()) {
    return { ok: false, reason: "not-configured" };
  }

  if (!TX_HASH_RE.test(hash)) {
    return { ok: false, reason: "invalid-tx-hash" };
  }

  let result: unknown;
  try {
    result = await nimiqRpcCall("getTransactionByHash", [normalized]);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // Nimiq Watch answers an unknown hash with an RPC *error*
    // ("Transaction not found: …"), not a null result. That's a client-side
    // verdict — the sponsor's tx isn't on-chain — not an infra failure, so
    // surface it as tx-not-found (→ 400) instead of rpc-error (→ 502).
    if (/not found/i.test(reason)) {
      return { ok: false, reason: "tx-not-found" };
    }
    log.warn("nimiq funding verification RPC failed", {
      scope: "nimiq.verify",
      reason,
    });
    return { ok: false, reason: "rpc-error" };
  }

  const tx = unwrap(result);
  if (!tx || typeof tx !== "object") {
    return { ok: false, reason: "tx-not-found" };
  }
  const t = tx as Record<string, unknown>;

  if (!isExecuted(t)) {
    return { ok: false, reason: "tx-not-executed" };
  }

  const recipient = txField(t, "recipient", "to", "recipientAddress", "toAddress");
  if (normalizeNimiqAddress(recipient) !== normalizeNimiqAddress(escrowAddress)) {
    return { ok: false, reason: "recipient-mismatch" };
  }

  const rawValue = txField(t, "value", "valueLunas", "value_lunas");
  const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
  if (!Number.isFinite(value) || value < minLunas) {
    return { ok: false, reason: "under-funded" };
  }

  const senderRaw = txField(t, "sender", "from", "senderAddress", "fromAddress");
  const sender = typeof senderRaw === "string" ? senderRaw : undefined;
  return { ok: true, txHash: normalized, sender };
}
