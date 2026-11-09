// Final reactivation gate — proves the verified-funding chain end-to-end
// on Nimiq TESTNET before lib/bounty-policy.ts is allowed to flip.
//
// What it does:
//   1. Hard-asserts NIMIQ_NETWORK === "testnet" (refuses to touch mainnet).
//   2. Derives the payout wallet address from NIMIQ_PRIVATE_KEY and reads
//      its balance from the configured JSON-RPC endpoint.
//   3. If the wallet can't cover the funding amount, prints the address +
//      the testnet faucet URL and STOPS — nothing else happens.
//   4. Otherwise it replays the real sponsor flow with an ephemeral sponsor
//      wallet: the payout wallet sends ~5 NIM to the sponsor, the sponsor
//      sends ~5 NIM to NIMIQ_ESCROW_ADDRESS, then the production verifier —
//      verifyFundingTx from lib/nimiq-verify.ts — is run against the escrow
//      deposit's tx hash and its verdict printed.
//
//   Why two hops: a Nimiq transaction with sender == recipient is invalid
//   (tx.verify throws "Sender same as recipient" and the mempool silently
//   drops it). On this deployment the payout wallet IS the escrow wallet, so
//   a direct send to escrow can never land. The hop through a fresh sponsor
//   address is also a more faithful rehearsal of production, where the
//   deposit always comes from a different wallet than the escrow. With 0-fee
//   testnet txs the round trip returns all 5 NIM to the payout wallet.
//
// Run with:
//   NODE_OPTIONS='--conditions=react-server' \
//     pnpm exec tsx scripts/verify-testnet-funding.ts
// (the react-server condition resolves `server-only` to its empty shim so
// lib/nimiq-verify.ts can be imported outside Next.js).
//
// Env comes from .env.local (loaded below). NIMIQ_PAYOUT_MOCK must NOT be 1 —
// in mock mode verifyFundingTx short-circuits and nothing would be proven.

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local is optional on the machine running this — env may be injected.
}

import type { Address as NimiqAddress, KeyPair as NimiqKeyPair } from "@nimiq/core";
import { verifyFundingTx } from "../lib/nimiq-verify";
import { getNimiqRpcUrl, nimiqRpcCall } from "../lib/nimiq-payout";

const LUNAS_PER_NIM = 100_000;
const FUNDING_NIM = 5;
const FUNDING_LUNAS = FUNDING_NIM * LUNAS_PER_NIM;
const FAUCET_URL = "https://test.nimiq.watch/#faucet";

// Nimiq PoS (Albatross) network ids — same values as lib/nimiq-payout.ts.
const NETWORK_IDS: Record<string, number> = {
  mainnet: 24, // MainAlbatross
  testnet: 5, // TestAlbatross
  devnet: 6, // DevAlbatross
};

function fail(message: string, code = 1): never {
  console.error(`\nGATE FAILED: ${message}`);
  process.exit(code);
}

/** Nimiq Watch RPC wraps results in `{ data: … }` on some methods. */
function unwrap(result: unknown): unknown {
  return result && typeof result === "object" && "data" in result
    ? (result as { data: unknown }).data
    : result;
}

async function getCurrentHeight(): Promise<number> {
  const result = unwrap(await nimiqRpcCall("getBlockNumber"));
  if (typeof result === "number") return result;
  const n = Number(result);
  if (Number.isFinite(n)) return n;
  throw new Error(`unexpected getBlockNumber result: ${JSON.stringify(result)}`);
}

async function getBalanceLunas(address: string): Promise<number> {
  const result = unwrap(await nimiqRpcCall("getAccountByAddress", [address]));
  if (result && typeof result === "object") {
    const balance = (result as { balance?: unknown }).balance;
    const n = typeof balance === "number" ? balance : Number(balance);
    if (Number.isFinite(n)) return n;
  }
  throw new Error(`unexpected getAccountByAddress result: ${JSON.stringify(result)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sign + broadcast a basic 0-fee tx; verifies locally first so a malformed
 *  tx fails fast instead of vanishing into the mempool. */
async function sendBasicTx(
  fromKeyPair: NimiqKeyPair,
  recipient: NimiqAddress,
  lunas: number,
  networkId: number,
): Promise<string> {
  const nimiq = await import("@nimiq/core");
  const { Transaction, AccountType } = nimiq;
  const sender = fromKeyPair.publicKey.toAddress();
  const height = await getCurrentHeight();

  const tx = new Transaction(
    sender,
    AccountType.Basic,
    new Uint8Array(0),
    recipient,
    AccountType.Basic,
    new Uint8Array(0),
    BigInt(lunas),
    BigInt(0), // fee
    0,
    height,
    networkId,
  );
  fromKeyPair.signTransaction(tx);

  // Offline sanity: catches "sender same as recipient" and bad signatures
  // before broadcast (the mempool drops those without reporting).
  tx.verify(networkId);

  const sendResult = await nimiqRpcCall("sendRawTransaction", [tx.toHex()]);
  const txHash =
    sendResult && typeof sendResult === "object" && "data" in sendResult
      ? String((sendResult as { data: string }).data)
      : typeof sendResult === "string"
        ? sendResult
        : String(tx.hash());
  return txHash;
}

/** Poll the RPC until the tx is indexed/executed; times out after ~2 min. */
async function waitForExecuted(txHash: string, label: string): Promise<void> {
  for (let attempt = 1; attempt <= 24; attempt++) {
    try {
      const result = unwrap(await nimiqRpcCall("getTransactionByHash", [txHash]));
      if (result && typeof result === "object") {
        const t = result as Record<string, unknown>;
        const executed =
          t.executionResult === true ||
          Number.isFinite(t.blockNumber) ||
          t.state === "executed" ||
          t.state === "included" ||
          t.state === "confirmed";
        if (executed) {
          console.log(`${label} confirmed (${txHash.slice(0, 12)}…) block ${t.blockNumber}`);
          return;
        }
      }
    } catch (err) {
      // "Transaction not found" while the mempool/indexer catches up — retry.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/not found/i.test(msg)) throw err;
    }
    await sleep(5_000);
    if (attempt % 6 === 0) console.log(`… waiting on ${label} (${attempt * 5}s)`);
  }
  throw new Error(`${label} ${txHash} was not confirmed within ~2 minutes`);
}

async function main() {
  // ── 1. Testnet hard gate ────────────────────────────────────────────────
  const network = process.env.NIMIQ_NETWORK ?? "testnet";
  if (network !== "testnet") {
    fail(`NIMIQ_NETWORK is "${network}" — this script only runs on testnet. Refusing to continue.`);
  }
  const networkId = process.env.NIMIQ_NETWORK_ID
    ? Number(process.env.NIMIQ_NETWORK_ID)
    : NETWORK_IDS[network];
  if (networkId !== NETWORK_IDS.testnet) {
    fail(`resolved network id ${networkId} is not testnet (${NETWORK_IDS.testnet}). Refusing to continue.`);
  }
  if (process.env.NIMIQ_PAYOUT_MOCK === "1") {
    fail("NIMIQ_PAYOUT_MOCK=1 — verifyFundingTx would short-circuit and prove nothing. Unset it for this run.");
  }

  const privateKeyHex = process.env.NIMIQ_PRIVATE_KEY;
  const escrow = process.env.NIMIQ_ESCROW_ADDRESS?.trim();
  if (!privateKeyHex) fail("NIMIQ_PRIVATE_KEY is not set.");
  if (!escrow) fail("NIMIQ_ESCROW_ADDRESS is not set.");

  console.log("=== verify-testnet-funding (Nimiq TESTNET) ===");
  console.log("RPC endpoint:", getNimiqRpcUrl());

  // ── 2. Derive payout wallet + read balance ──────────────────────────────
  const nimiq = await import("@nimiq/core");
  const { Address, KeyPair, PrivateKey } = nimiq;
  const privateKey = PrivateKey.fromHex(privateKeyHex as string);
  const keyPair = KeyPair.derive(privateKey);
  const wallet = keyPair.publicKey.toAddress();
  const walletFriendly = wallet.toUserFriendlyAddress();

  console.log("Payout wallet:", walletFriendly);
  console.log("Escrow addr  :", escrow);

  const balanceLunas = await getBalanceLunas(walletFriendly);
  const balanceNim = balanceLunas / LUNAS_PER_NIM;
  console.log(`Balance      : ${balanceNim.toLocaleString()} NIM (${balanceLunas} lunas)`);

  // ── 3. Insufficient balance → print faucet + stop ───────────────────────
  // Hop 1 funds the sponsor; hop 2 is the escrow deposit — same 5 NIM moves
  // twice, so the wallet only needs ≥ FUNDING_NIM once.
  if (balanceLunas < FUNDING_LUNAS) {
    console.log("\nInsufficient testnet balance to fund the gate transaction.");
    console.log(`Needed : ≥ ${FUNDING_NIM} NIM — have ${balanceNim} NIM.`);
    console.log(`Fund   : ${walletFriendly}`);
    console.log(`Faucet : ${FAUCET_URL}`);
    console.log("\nSTOPPING — bounty payment policy stays paused. Re-run after funding.");
    process.exit(2);
  }

  const escrowAddr = Address.fromUserFriendlyAddress(escrow);
  if (escrowAddr.toUserFriendlyAddress() === walletFriendly) {
    console.log(
      "\nNote: payout wallet == escrow wallet — a direct send would be an",
    );
    console.log("invalid self-transfer. Using the ephemeral-sponsor two-hop,");
    console.log("which also mirrors production (sponsor ≠ escrow).\n");
  }

  // ── 4. Hop 1: payout wallet → ephemeral sponsor ─────────────────────────
  const sponsorKeyPair = KeyPair.derive(PrivateKey.generate());
  const sponsorAddr = sponsorKeyPair.publicKey.toAddress();
  console.log("Sponsor      :", sponsorAddr.toUserFriendlyAddress(), "(ephemeral)");

  console.log(`\nHop 1/2: wallet → sponsor, ${FUNDING_NIM} NIM…`);
  const hop1Hash = await sendBasicTx(keyPair, sponsorAddr, FUNDING_LUNAS, networkId);
  console.log("broadcast:", hop1Hash);
  await waitForExecuted(hop1Hash, "hop 1");

  // ── 5. Hop 2: sponsor → escrow (the tx the gate actually verifies) ──────
  console.log(`\nHop 2/2: sponsor → escrow, ${FUNDING_NIM} NIM…`);
  const fundingTxHash = await sendBasicTx(sponsorKeyPair, escrowAddr, FUNDING_LUNAS, networkId);
  console.log("broadcast:", fundingTxHash);

  // verifyFundingTx itself is the confirmation probe: it only returns ok
  // once the tx is executed, paying the escrow, at/above the funded value.
  let verdict;
  for (let attempt = 1; attempt <= 30; attempt++) {
    verdict = await verifyFundingTx(fundingTxHash, FUNDING_LUNAS, escrow);
    if (
      verdict.ok ||
      (verdict.reason !== "tx-not-found" && verdict.reason !== "tx-not-executed")
    ) {
      break;
    }
    await sleep(5_000);
    if (attempt % 6 === 0) console.log(`… still waiting for confirmation (${attempt * 5}s)`);
  }

  console.log("\nverifyFundingTx verdict:", JSON.stringify(verdict));
  if (!verdict?.ok) {
    fail(`funding transaction did not verify (${verdict?.reason ?? "no verdict"}). Policy stays paused.`);
  }

  console.log(`\nGATE PASSED — ${FUNDING_NIM} NIM testnet escrow deposit verified on-chain.`);
  console.log(`funding txHash: ${verdict.txHash}`);
  console.log(`sender        : ${verdict.sender ?? "(unknown)"}`);
  console.log("Explorer:", `https://test.nimiq.watch/#/tx/${verdict.txHash}`);
}

main().catch((err) => {
  console.error("\nGATE ERROR:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
