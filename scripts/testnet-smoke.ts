/**
 * Testnet smoke test: creates a kye via the deployed KyeFactory.
 *
 *   TON_API_KEY=...
 *   TON_FACTORY_ADDRESS=...
 *   WALLET_MNEMONIC="..."
 *   pnpm tsx scripts/testnet-smoke.ts
 */
import { mnemonicToWalletKey } from '@ton/crypto';
import { TonClient, WalletContractV4, internal } from '@ton/ton';
import { Address, toNano } from '@ton/core';
import { buildCreateKyeBody } from '../packages/shared/src/contractMessages';

const ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const WEEK = 7n * 24n * 60n * 60n;

async function main() {
  const mnemonic = (process.env.WALLET_MNEMONIC ?? '').trim();
  const apiKey = process.env.TON_API_KEY;
  const factoryRaw = process.env.TON_FACTORY_ADDRESS ?? '';
  if (!mnemonic || !apiKey || !factoryRaw) {
    throw new Error('Set WALLET_MNEMONIC, TON_API_KEY, TON_FACTORY_ADDRESS');
  }

  const factory = Address.parse(factoryRaw);
  const key = await mnemonicToWalletKey(mnemonic.split(/\s+/));
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: key.publicKey });
  const client = new TonClient({ endpoint: ENDPOINT, apiKey });

  console.log('[smoke] organizer:', wallet.address.toString({ testOnly: true }));
  console.log('[smoke] factory:  ', factory.toString({ testOnly: true }));

  const params = {
    organizer: wallet.address,
    memberCount: 3n,
    contribution: toNano('0.1'),
    roundIntervalSec: WEEK,
    feeRateBps: 300n,
    timeAdjustmentMaxBps: 500n,
    defaultPolicy: 0n,
    salt: BigInt(Date.now()),
  };

  const body = buildCreateKyeBody(params);

  const wc = client.open(wallet);
  const seqno = await wc.getSeqno();
  console.log('[smoke] seqno:', seqno);

  await wc.sendTransfer({
    seqno,
    secretKey: key.secretKey,
    messages: [internal({ to: factory, value: toNano('0.35'), body, bounce: true })],
  });
  console.log('[smoke] CreateKye sent; waiting for inclusion...');

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const s = await wc.getSeqno();
    if (s > seqno) {
      console.log(`[smoke] confirmed in ${(i + 1) * 4}s (new seqno ${s})`);
      break;
    }
  }

  console.log('');
  console.log('[smoke] Factory should have emitted KyeCreatedEvt with the child kye address.');
  console.log('[smoke] Check explorer:');
  console.log(`         https://testnet.tonscan.org/address/${factory.toString({ testOnly: true })}`);
  console.log('[smoke] The child kye contract address appears in the "Transactions" tab as an');
  console.log('         outgoing message destination from the factory.');
}

main().catch((e) => {
  console.error('[smoke] FAILED:', e?.message ?? e);
  process.exit(1);
});
