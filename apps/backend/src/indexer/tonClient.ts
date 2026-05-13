import { TonClient } from '@ton/ton';
import { Address, Cell } from '@ton/core';
import { logger } from '../lib/logger.js';
import { decodeEvent, DecodedEvent } from './events.js';

export interface RawTxEvent {
  txHash: string;
  lt: bigint;
  now: number;
  event: DecodedEvent;
}

export interface ITonClient {
  getTransactionsForAddress(address: string, fromLt?: bigint): Promise<RawTxEvent[]>;
}

let _client: TonClient | null = null;

export function getTonClient(): TonClient {
  if (_client) return _client;
  const endpoint =
    process.env.TON_RPC_URL ??
    process.env.TON_API_ENDPOINT ??
    'https://testnet.toncenter.com/api/v2/jsonRPC';
  _client = new TonClient({ endpoint, apiKey: process.env.TON_API_KEY });
  return _client;
}

/** Test hook */
export function __setTonClient(c: TonClient | null): void {
  _client = c;
}

/**
 * Fetch transactions newer than `fromLt` for `address`. Returns one entry per
 * external-out emitted event (i.e. one tx may produce multiple events).
 */
export async function getTransactionsForAddress(
  address: string,
  fromLt?: bigint,
): Promise<RawTxEvent[]> {
  const client = getTonClient();
  const addr = Address.parse(address);
  const txs = await client.getTransactions(addr, { limit: 50, archival: true });
  const out: RawTxEvent[] = [];
  for (const tx of txs) {
    const lt = BigInt(tx.lt);
    if (fromLt !== undefined && lt <= fromLt) continue;
    const hashHex = tx.hash().toString('hex');
    // External-out messages with no destination are emit() calls.
    for (const msg of tx.outMessages.values()) {
      if (msg.info.type !== 'external-out') continue;
      let body: Cell;
      try {
        body = msg.body;
      } catch {
        continue;
      }
      const decoded = decodeEvent(body);
      if (!decoded) continue;
      out.push({ txHash: hashHex, lt, now: tx.now, event: decoded });
    }
  }
  return out;
}
