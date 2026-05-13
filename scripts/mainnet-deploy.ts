/**
 * mainnet-deploy.ts
 *
 * Deploys the `KyeFactory` contract to TON testnet or mainnet,
 * prints a deterministic init hash, and emits a markdown log row
 * ready to paste into `docs/MAINNET_DEPLOY.md` §11.
 *
 * The script is designed for a "test on testnet first" workflow:
 *
 *   TON_NETWORK=testnet pnpm tsx scripts/mainnet-deploy.ts   # dry run
 *   TON_NETWORK=mainnet pnpm tsx scripts/mainnet-deploy.ts   # the real thing
 *
 * Required env vars:
 *   TON_NETWORK              "testnet" | "mainnet"
 *   WALLET_MNEMONIC          24-word BIP39 mnemonic for the deployer wallet
 *   PLATFORM_TREASURY_ADDRESS  Address of the deployed multisig treasury
 *
 * Optional:
 *   OWNER_ADDRESS            Defaults to the deployer wallet address
 *   TON_API_KEY              toncenter API key (recommended)
 *   DEPLOYER_HANDLE          Used in the log row (default: $USER)
 *   DRY_RUN=1                Compute the init hash + log row but skip the
 *                            actual send. Useful for review.
 *
 * The actual contract send uses `@ton/ton`'s WalletContractV4 + a v4 wallet.
 * No external blueprint runtime is required.
 */

import { mnemonicToWalletKey } from '@ton/crypto';
import { Address, beginCell, toNano } from '@ton/core';
// `@ton/ton` is loaded lazily so that environments without it (CI, sandbox)
// can still run the script up to the init-hash computation step.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - the build artifact path resolves at runtime
import { KyeFactory } from '../packages/contracts/build/KyeFactory/KyeFactory_KyeFactory';

interface TonClientLike {
  getBalance(addr: Address): Promise<bigint>;
  getContractState(addr: Address): Promise<{ state: string }>;
  open(wallet: unknown): { getSeqno(): Promise<number>; sendTransfer(args: unknown): Promise<void> };
}
interface TonRuntime {
  TonClient: new (opts: { endpoint: string; apiKey?: string }) => TonClientLike;
  WalletContractV4: { create(opts: { workchain: number; publicKey: Buffer }): { address: Address } };
  internal: (args: unknown) => unknown;
}
async function loadTonRuntime(): Promise<TonRuntime | null> {
  try {
    // @ts-ignore optional dependency
    return (await import('@ton/ton')) as unknown as TonRuntime;
  } catch {
    return null;
  }
}

interface Env {
  network: 'testnet' | 'mainnet';
  mnemonic: string;
  treasury: Address;
  owner?: Address;
  apiKey?: string;
  deployer: string;
  dryRun: boolean;
}

function readEnv(): Env {
  const network = (process.env.TON_NETWORK ?? '').toLowerCase();
  if (network !== 'testnet' && network !== 'mainnet') {
    throw new Error(
      `TON_NETWORK must be "testnet" or "mainnet" (got: ${JSON.stringify(process.env.TON_NETWORK)}).\n` +
        'Run the testnet dry-run first:\n' +
        '  TON_NETWORK=testnet WALLET_MNEMONIC="..." PLATFORM_TREASURY_ADDRESS="kQ..." \\\n' +
        '    pnpm tsx scripts/mainnet-deploy.ts',
    );
  }

  const mnemonic = process.env.WALLET_MNEMONIC?.trim();
  if (!mnemonic) {
    throw new Error(
      'WALLET_MNEMONIC is not set. Provide the 24-word mnemonic of a wallet ' +
        'with sufficient balance (>= 0.5 TON for the deploy).\n' +
        'For testnet: get coins from https://t.me/testgiver_ton_bot',
    );
  }
  const words = mnemonic.split(/\s+/).filter(Boolean);
  if (words.length !== 24) {
    throw new Error(`WALLET_MNEMONIC must be 24 words (got ${words.length}).`);
  }

  const treasuryRaw = process.env.PLATFORM_TREASURY_ADDRESS?.trim();
  if (!treasuryRaw) {
    throw new Error(
      'PLATFORM_TREASURY_ADDRESS is not set. Deploy the multisig treasury ' +
        'first (see scripts/README.md §Multisig).',
    );
  }
  let treasury: Address;
  try {
    treasury = Address.parse(treasuryRaw);
  } catch (e) {
    throw new Error(`PLATFORM_TREASURY_ADDRESS is not a valid TON address: ${treasuryRaw}`);
  }

  const ownerRaw = process.env.OWNER_ADDRESS?.trim();
  const owner = ownerRaw ? Address.parse(ownerRaw) : undefined;

  return {
    network,
    mnemonic,
    treasury,
    owner,
    apiKey: process.env.TON_API_KEY,
    deployer: process.env.DEPLOYER_HANDLE ?? process.env.USER ?? 'unknown',
    dryRun: process.env.DRY_RUN === '1',
  };
}

function endpoint(network: 'testnet' | 'mainnet'): string {
  if (process.env.TON_RPC_URL) return process.env.TON_RPC_URL;
  return network === 'mainnet'
    ? 'https://toncenter.com/api/v2/jsonRPC'
    : 'https://testnet.toncenter.com/api/v2/jsonRPC';
}

function explorer(network: 'testnet' | 'mainnet', addr: Address): string {
  const host = network === 'mainnet' ? 'tonscan.org' : 'testnet.tonscan.org';
  return `https://${host}/address/${addr.toString()}`;
}

async function main(): Promise<void> {
  const env = readEnv();
  console.log(`[deploy] network=${env.network} dryRun=${env.dryRun}`);

  const key = await mnemonicToWalletKey(env.mnemonic.split(/\s+/).filter(Boolean));
  const runtimeForWallet = await loadTonRuntime();
  let walletAddress: Address;
  let wallet: { address: Address } | null = null;
  if (runtimeForWallet) {
    wallet = runtimeForWallet.WalletContractV4.create({ workchain: 0, publicKey: key.publicKey });
    walletAddress = wallet.address;
  } else {
    // We cannot derive the v4 wallet address without @ton/ton. Use the owner
    // env var as a placeholder so the init-hash computation still proceeds.
    if (!env.owner) {
      throw new Error(
        '@ton/ton is not installed and OWNER_ADDRESS is not set, so the ' +
          'deployer wallet address cannot be derived. Either install @ton/ton ' +
          '(`pnpm add -w @ton/ton`) or pass OWNER_ADDRESS explicitly.',
      );
    }
    walletAddress = env.owner;
  }
  const owner = env.owner ?? walletAddress;

  // 1. Compute init deterministically.
  const factoryContract = await KyeFactory.fromInit(owner, env.treasury);
  const factoryAddress = factoryContract.address;
  const stateInitCell = beginCell()
    .store((b) => {
      b.storeRef(factoryContract.init!.code);
      b.storeRef(factoryContract.init!.data);
    })
    .endCell();
  const initHash = '0x' + stateInitCell.hash().toString('hex');

  console.log(`[deploy] deployer wallet : ${walletAddress.toString()}`);
  console.log(`[deploy] owner           : ${owner.toString()}`);
  console.log(`[deploy] treasury        : ${env.treasury.toString()}`);
  console.log(`[deploy] factory address : ${factoryAddress.toString()}`);
  console.log(`[deploy] init hash       : ${initHash}`);

  const runtime = await loadTonRuntime();
  if (!runtime) {
    console.warn(
      '\n[deploy] @ton/ton is not installed. The init hash and address have been ' +
        'computed above, but the actual deploy cannot be sent.\n' +
        '         Install it before doing a real deploy:\n' +
        '           pnpm add -w @ton/ton\n',
    );
    emitLogRow(env, factoryAddress, initHash);
    return;
  }
  const client = new runtime.TonClient({ endpoint: endpoint(env.network), apiKey: env.apiKey });

  // 2. Check deployer balance.
  let balance: bigint;
  try {
    balance = await client.getBalance(walletAddress);
  } catch (e) {
    throw new Error(
      `Failed to query deployer balance: ${(e as Error).message}.\n` +
        `Endpoint: ${endpoint(env.network)}.\n` +
        'If you hit a rate limit, set TON_API_KEY (get one at https://toncenter.com).',
    );
  }
  console.log(`[deploy] deployer balance: ${Number(balance) / 1e9} TON`);
  const MIN_TON = toNano('0.3');
  if (balance < MIN_TON) {
    throw new Error(
      `Deployer wallet ${walletAddress.toString()} has insufficient funds ` +
        `(${Number(balance) / 1e9} TON < 0.3 TON required).\n` +
        (env.network === 'testnet'
          ? 'Fund the wallet first: https://t.me/testgiver_ton_bot'
          : 'Fund the wallet first via your custody / exchange withdrawal.'),
    );
  }

  // 3. Check if factory already deployed.
  const state = await client.getContractState(factoryAddress);
  if (state.state === 'active') {
    console.log('[deploy] factory already deployed at this address; skipping send.');
  } else if (env.dryRun) {
    console.log('[deploy] DRY_RUN=1 — skipping send.');
  } else {
    // 4. Send deploy from wallet.
    if (!wallet) throw new Error('internal: wallet is null but runtime is loaded');
    const walletContract = client.open(wallet);
    const seqno = await walletContract.getSeqno();
    await walletContract.sendTransfer({
      seqno,
      secretKey: key.secretKey,
      messages: [
        runtime.internal({
          to: factoryAddress,
          value: toNano('0.2'),
          init: factoryContract.init,
          body: beginCell().endCell(), // empty deploy body
          bounce: false,
        }),
      ],
    });
    console.log('[deploy] deploy message sent; waiting for confirmation...');
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const s = await client.getContractState(factoryAddress);
      if (s.state === 'active') {
        console.log(`[deploy] confirmed after ${i + 1} polls`);
        break;
      }
    }
  }

  emitLogRow(env, factoryAddress, initHash);
}

function emitLogRow(env: Env, factoryAddress: Address, initHash: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const treasuryShort = env.treasury.toString().slice(0, 8) + '...';
  const factoryShort = factoryAddress.toString().slice(0, 8) + '...';
  const initHashShort = initHash.slice(0, 10) + '...';
  const logRow =
    `| ${today} | KyeFactory | ${factoryAddress.toString()} | ${initHash} | ` +
    `${env.treasury.toString()} | <signer 1> + <signer 2> | <smoke-test kye> | ${env.deployer} |`;
  const summaryRow =
    `| ${today} | KyeFactory | ${factoryShort} | ${initHashShort} | ` +
    `${treasuryShort} | <signer 1> + <signer 2> | <smoke-test kye> | ${env.deployer} |`;

  console.log('\n--- MAINNET_DEPLOY.md §11 log row (full) ---');
  console.log(logRow);
  console.log('\n--- Compact summary (for chat/PR) ---');
  console.log(summaryRow);
  console.log(`\nExplorer: ${explorer(env.network, factoryAddress)}`);
  console.log(`\nNext steps: smoke-test by creating a 3-member kye (see §9).`);
}

main().catch((err) => {
  console.error(`\n[deploy] FAILED: ${(err as Error).message}`);
  process.exit(1);
});
