/**
 * Generates a fresh TON wallet and prints the mnemonic + address.
 * Use ONLY for testnet. Never commit the mnemonic.
 *
 *   pnpm tsx scripts/gen-testnet-wallet.ts
 */
import { mnemonicNew, mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';

async function main() {
  const mnemonic = await mnemonicNew(24);
  const key = await mnemonicToWalletKey(mnemonic);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: key.publicKey });

  console.log('=== TON Testnet Wallet ===');
  console.log('Mnemonic (24 words — keep SECRET, never commit):');
  console.log('  ' + mnemonic.join(' '));
  console.log('');
  console.log('Address (testnet, non-bounceable):');
  console.log('  ' + wallet.address.toString({ testOnly: true, bounceable: false }));
  console.log('');
  console.log('Address (testnet, bounceable):');
  console.log('  ' + wallet.address.toString({ testOnly: true, bounceable: true }));
  console.log('');
  console.log('Next steps:');
  console.log('  1. Send the non-bounceable address to @testgiver_ton_bot on Telegram (testnet only).');
  console.log('  2. Wait for the bot to send you 5 testnet TON.');
  console.log('  3. Set WALLET_MNEMONIC env (one line, words separated by spaces).');
  console.log('  4. Run:');
  console.log('       TON_NETWORK=testnet WALLET_MNEMONIC="..." \\');
  console.log('         PLATFORM_TREASURY_ADDRESS="<same address for now>" \\');
  console.log('         pnpm tsx scripts/mainnet-deploy.ts');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
