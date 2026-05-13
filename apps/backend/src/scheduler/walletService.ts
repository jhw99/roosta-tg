import { Address, Cell, internal, SendMode, toNano } from '@ton/core';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { buildExecuteRoundBody as buildExecuteRoundBodyShared } from '@roosta/shared/contractMessages';
import { logger } from '../lib/logger.js';

export interface WalletContext {
  client: TonClient;
  wallet: WalletContractV4;
  secretKey: Buffer;
  publicKey: Buffer;
}

let _ctx: WalletContext | null = null;

/** Test hook. */
export function __setWalletContext(ctx: WalletContext | null): void {
  _ctx = ctx;
}

export async function getWalletContext(): Promise<WalletContext> {
  if (_ctx) return _ctx;
  const mnemonic = process.env.WALLET_MNEMONIC;
  if (!mnemonic) throw new Error('WALLET_MNEMONIC is not set');
  const words = mnemonic.trim().split(/\s+/);
  const key = await mnemonicToWalletKey(words);
  const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
  const endpoint =
    process.env.TON_RPC_URL ??
    process.env.TON_API_ENDPOINT ??
    'https://testnet.toncenter.com/api/v2/jsonRPC';
  const client = new TonClient({ endpoint, apiKey: process.env.TON_API_KEY });
  _ctx = { client, wallet, secretKey: key.secretKey, publicKey: key.publicKey };
  return _ctx;
}

/**
 * F-04: in-process mutex serializing wallet sends. Two parallel callers would
 * otherwise read the same `seqno` and the second send would be rejected
 * on-chain. For multi-process deployments use a Redis-backed distributed lock
 * (out of scope for the MVP single-instance scheduler — see GSD §6).
 */
class WalletMutex {
  private chain: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }
}
const walletMutex = new WalletMutex();

/**
 * Send an internal message from the backend wallet to a contract.
 * Returns the resulting external-in message hash (best-effort identifier).
 * Serialized via {@link WalletMutex} to avoid seqno races.
 */
export async function sendInternalMessage(
  toAddress: string,
  body: Cell,
  value: bigint = toNano('0.1'),
): Promise<{ seqno: number }> {
  return walletMutex.run(async () => {
    const ctx = await getWalletContext();
    const contract = ctx.client.open(ctx.wallet);
    const seqno = await contract.getSeqno();
    await contract.sendTransfer({
      secretKey: ctx.secretKey,
      seqno,
      messages: [
        internal({
          to: Address.parse(toAddress),
          value,
          body,
          bounce: true,
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });
    logger.info({ to: toAddress, seqno }, 'wallet sent internal message');
    return { seqno };
  });
}

/** Build the body for the ExecuteRound opcode. Delegates to the shared encoder. */
export function buildExecuteRoundBody(nonce: bigint | number = 0n): Cell {
  return buildExecuteRoundBodyShared(nonce);
}
