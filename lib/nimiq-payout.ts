import { log } from "./log";

const LUNAS_PER_NIM = 100_000;

export interface PayoutResult {
  txHash: string;
  status: "paid";
  amountLunas: number;
  recipient: string;
}

/**
 * Execute a NIM payout to a contributor. In production this would initialize
 * @nimiq/core (or a secure signer) and broadcast a transaction. For the
 * hackathon / Nimiq Mini App competition we mock the on-chain step with a
 * realistic txHash and a deterministic delay so the UX is identical while
 * avoiding real funds / private keys in the repo.
 */
export async function executeNimiqPayout(
  recipient: string,
  amountNim: number,
): Promise<PayoutResult> {
  if (!recipient || !recipient.startsWith("NQ")) {
    throw new Error("Invalid Nimiq recipient address");
  }
  if (!Number.isFinite(amountNim) || amountNim <= 0) {
    throw new Error("Payout amount must be a positive number of NIM");
  }

  const amountLunas = Math.floor(amountNim * LUNAS_PER_NIM);

  // Simulate network latency + signing broadcast. In production, replace
  // this block with real Nimiq transaction creation and broadcast.
  await new Promise((resolve) => setTimeout(resolve, 1200));
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
