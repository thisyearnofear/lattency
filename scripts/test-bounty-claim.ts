import type { NextRequest } from "next/server";
import { KeyPair, PrivateKey } from "@nimiq/core";

// Configure the Nimiq payout path BEFORE importing any route or lib modules.
// lib/db.ts is a lazy Proxy now, so no DATABASE_URL is needed at module load;
// the bounty logic falls back to the in-memory snapshot automatically.
process.env.NIMIQ_NETWORK ??= "testnet";
process.env.NIMIQ_PAYOUT_MOCK ??= "0";
process.env.NIMIQ_RPC_URL ??= "https://rpc.testnet.nimiqwatch.com/";

const NIMIQ_PRIVATE_KEY = process.env.NIMIQ_PRIVATE_KEY;
if (!NIMIQ_PRIVATE_KEY || !/^[0-9a-fA-F]{64}$/.test(NIMIQ_PRIVATE_KEY)) {
  throw new Error(
    "Set NIMIQ_PRIVATE_KEY to a 64-character hex private key of a funded testnet wallet before running this script."
  );
}

const RECIPIENT_ADDRESS = process.env.NIMIQ_RECIPIENT ??
  KeyPair.derive(PrivateKey.generate()).publicKey.toAddress().toUserFriendlyAddress();

async function main() {
  // Dynamic imports after env is configured.
  const { createBounty } = await import("../lib/bounties");
  const { POST } = await import("../app/api/bounties/claim/route");

  const bounty = await createBounty({
    goal: "End-to-end bounty claim test",
    area: "Test",
    target: 1,
    rewardNim: 0.01,
    sponsor: "E2E Tester",
    sponsorKind: "community",
    kind: "first-in-neighbourhood",
    expiresAt: "2027-01-01",
  });

  // Make the bounty eligible for claim.
  bounty.progress = bounty.target;

  const request = new Request("http://localhost/api/bounties/claim", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vercel-id": "e2e-test",
    },
    body: JSON.stringify({
      bountyId: bounty.id,
      nimiqAddress: RECIPIENT_ADDRESS,
    }),
  }) as NextRequest;

  console.log(`Claiming bounty ${bounty.id} for ${RECIPIENT_ADDRESS}...`);
  const response = await POST(request);
  const body = await response.json();

  console.log("status:", response.status);
  console.log("body:", JSON.stringify(body, null, 2));

  if (!response.ok || !body.success || typeof body.txHash !== "string") {
    console.error("❌ End-to-end bounty claim failed");
    process.exit(1);
  }

  if (bounty.status !== "paid" || bounty.txHash !== body.txHash) {
    console.error("❌ Payout broadcast but in-memory bounty was not marked paid");
    process.exit(1);
  }

  const txHashClean = body.txHash.replace(/^0x/, "");
  console.log("✅ End-to-end bounty claim succeeded with real Nimiq payout");
  console.log(`   txHash: ${body.txHash}`);
  console.log(`   explorer: https://testnet.nimiq.watch/tx/${txHashClean}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
