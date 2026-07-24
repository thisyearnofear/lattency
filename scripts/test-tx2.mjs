import * as Nimiq from '@nimiq/core';

const pk = Nimiq.PrivateKey.generate();
const keyPair = Nimiq.KeyPair.derive(pk);
const sender = keyPair.publicKey.toAddress();
const recipient = Nimiq.Address.fromUserFriendlyAddress(sender.toUserFriendlyAddress());

const tx = new Nimiq.Transaction(
  sender,
  Nimiq.AccountType.Basic,
  new Uint8Array(0),
  recipient,
  Nimiq.AccountType.Basic,
  new Uint8Array(0),
  BigInt(1000),
  BigInt(0),
  0,
  1,
  2
);

console.log('tx value:', tx.value);
console.log('tx fee:', tx.fee);

keyPair.signTransaction(tx);
console.log('signed');
console.log('tx.toHex:', tx.toHex());
console.log('hash type:', typeof tx.hash());
console.log('hash:', tx.hash());
