import * as Nimiq from "@nimiq/core";

const privateKey = Nimiq.PrivateKey.generate();
const keyPair = Nimiq.KeyPair.derive(privateKey);
const sender = keyPair.publicKey.toAddress();
const recipient = Nimiq.Address.fromString(sender.toString());

console.log("Sender:", sender.toString());
console.log("Recipient:", recipient.toString());

// Try direct Transaction constructor
// sender, senderType, recipient, recipientType, value, fee, validityStartHeight, flags, data
try {
  const tx = new Nimiq.Transaction(
    sender,
    Nimiq.AccountType.Basic,
    recipient,
    Nimiq.AccountType.Basic,
    BigInt(1000),
    BigInt(0),
    1,
    Nimiq.TransactionFlag.NONE,
    new Uint8Array(0)
  );
  console.log("Tx:", tx);
  console.log("Tx hash:", tx.hash.toHex());

  // Sign the transaction
  const signature = tx.sign(keyPair.privateKey);
  console.log("Signature:", signature);
} catch (err) {
  console.error("Tx error:", err.message);
  console.error(err);
}
