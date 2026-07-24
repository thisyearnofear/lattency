import * as Nimiq from '@nimiq/core';

console.log('Transaction keys:', Object.keys(Nimiq.Transaction).slice(0, 30));
console.log('newBasic:', typeof Nimiq.Transaction.newBasic);

const pk = Nimiq.PrivateKey.generate();
const keyPair = Nimiq.KeyPair.derive(pk);
const sender = keyPair.publicKey.toAddress();
const recipient = Nimiq.Address.fromUserFriendlyAddress(sender.toUserFriendlyAddress());

console.log('sender:', sender.toUserFriendlyAddress());
console.log('sender hex:', sender.toHex());

let tx;
if (Nimiq.Transaction.newBasic) {
  tx = Nimiq.Transaction.newBasic(sender, recipient, BigInt(1000), BigInt(0), 1, 2);
  console.log('newBasic ok');
} else {
  tx = new Nimiq.Transaction(sender, Nimiq.AccountType.Basic, new Uint8Array(0), recipient, Nimiq.AccountType.Basic, new Uint8Array(0), BigInt(1000), BigInt(0), 0, 1, 2);
  console.log('constructor ok');
}

try {
  keyPair.signTransaction(tx);
  console.log('signTransaction ok');
  console.log('tx hash:', tx.hash().toHex());
  console.log('tx hex:', tx.toHex());
} catch (err) {
  console.error('sign error:', err.message);
}
