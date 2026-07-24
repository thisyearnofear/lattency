import * as Nimiq from '@nimiq/core';

async function main() {
  const config = new Nimiq.ClientConfiguration();
  config.network('TestAlbatross');
  config.logLevel('error');
  // pico sync for speed
  config.syncMode('pico');
  const client = await Nimiq.Client.create(config.build());
  const networkId = await client.getNetworkId();
  console.log('TestAlbatross networkId:', networkId);
  await client.disconnectNetwork();
}
main().catch(e => { console.error(e.message); process.exit(1); });
