import * as Nimiq from '@nimiq/core';

async function main() {
  const config = new Nimiq.ClientConfiguration();
  config.network('TestAlbatross');
  config.logLevel('error');
  const client = await Nimiq.Client.create(config.build());
  const networkId = await client.getNetworkId();
  console.log('networkId', networkId);
  await client.disconnectNetwork();
  console.log('done');
}
main().catch(e=>{console.error(e.message); process.exit(1)});
