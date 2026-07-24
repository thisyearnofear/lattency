import * as Nimiq from '@nimiq/core';

const pk = Nimiq.PrivateKey.generate();
const keyPair = Nimiq.KeyPair.derive(pk);
const sender = keyPair.publicKey.toAddress();
const recipient = sender; // self-transfer

console.log('Sender:', sender.toUserFriendlyAddress());
console.log('Sender hex:', sender.toHex());
console.log('networkId?', Nimiq.GenesisConfig ? Object.keys(Nimiq.GenesisConfig) : 'no GenesisConfig');
console.log('NetworkId?', Nimiq.NetworkId ? Nimiq.NetworkId : 'no NetworkId');

// Try newBasic if exists
if (Nimiq.Transaction.newBasic) {
  try {
    const tx = Nimiq.Transaction.newBasic(sender, recipient, BigInt(1000), BigInt(0), 1, 2);
    console.log('newBasic tx:', tx);
  } catch (err) {
    console.error('newBasic error:', err.message);
  }
}
