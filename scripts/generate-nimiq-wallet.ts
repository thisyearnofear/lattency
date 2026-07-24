import { PrivateKey, KeyPair } from "@nimiq/core";

/**
 * Generate a fresh Nimiq hot-wallet for the escrow.
 *
 * Run with:
 *   pnpm exec tsx scripts/generate-nimiq-wallet.ts
 *
 * The script prints the address and private key hex. Fund the address from the
 * Nimiq testnet faucet, then set the private key in your environment as
 * NIMIQ_PRIVATE_KEY. NEVER commit the private key to version control.
 */
async function main() {
  const privateKey = PrivateKey.generate();
  const keyPair = KeyPair.derive(privateKey);
  const address = keyPair.publicKey.toAddress();

  console.log("=== Nimiq escrow wallet ===");
  console.log("Address:   ", address.toUserFriendlyAddress());
  console.log("PrivateKey:", privateKey.toHex());
  console.log();
  console.log(
    "Fund the address from https://test.nimiq.watch/#faucet (or mainnet source),",
  );
  console.log(
    "then set NIMIQ_PRIVATE_KEY to the hex above in your deployment secrets.",
  );
}

main().catch((err) => {
  console.error("Wallet generation failed:", err.message);
  process.exit(1);
});
