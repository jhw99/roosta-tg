import type { SupabaseClient } from '@supabase/supabase-js';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../lib/logger.js';
import { getSupabase } from './supabase.js';
import { getTransactionsForAddress as defaultGetTxs, RawTxEvent } from './tonClient.js';
import { ContractRegistry } from './registry.js';
import type { DecodedEvent } from './events.js';

export interface IndexerState {
  lastProcessedLt: bigint;
  lastProcessedHash: string | null;
}

export interface IndexerOptions {
  /** Polling interval in ms. Default 10s (GSD §3.2). */
  pollIntervalMs?: number;
  /** Replace tx fetcher (used for tests). */
  fetchTransactions?: (address: string, fromLt?: bigint) => Promise<RawTxEvent[]>;
  /** Replace Supabase client (used for tests). */
  supabase?: SupabaseClient | null;
  /** Optional BullMQ queue for notification jobs. */
  notificationQueue?: Pick<Queue, 'add'> | null;
  /** Initial contract addresses to track. */
  initialAddresses?: string[];
}

/** Recipient/channel matrix per GSD §6.1. */
const NOTIFICATION_MATRIX: Record<string, { audience: string; channel: 'dm' | 'group' }[]> = {
  KyeCreated: [{ audience: 'organizer', channel: 'dm' }],
  MemberJoined: [
    { audience: 'organizer', channel: 'group' },
    { audience: 'members', channel: 'group' },
  ],
  KyeActivated: [
    { audience: 'all', channel: 'group' },
    { audience: 'all', channel: 'dm' },
  ],
  RoundExecuted: [{ audience: 'all', channel: 'group' }],
  PayoutSent: [{ audience: 'winner', channel: 'dm' }],
  DefaultDetected: [
    { audience: 'defaulter', channel: 'dm' },
    { audience: 'organizer', channel: 'dm' },
  ],
  KyeCompleted: [
    { audience: 'all', channel: 'group' },
    { audience: 'all', channel: 'dm' },
  ],
  KyeCancelled: [{ audience: 'all', channel: 'group' }],
  FeeDistributed: [],
  ContributionReceived: [],
};

export class EventIndexer {
  private readonly registry: ContractRegistry;
  private readonly fetchTxs: (address: string, fromLt?: bigint) => Promise<RawTxEvent[]>;
  private readonly supabase: SupabaseClient | null;
  private readonly notificationQueue: Pick<Queue, 'add'> | null;
  private readonly pollIntervalMs: number;

  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private backoffMs = 5000;
  private readonly maxBackoffMs = 5 * 60 * 1000;
  private readonly cursors = new Map<string, IndexerState>();

  constructor(opts: IndexerOptions = {}) {
    this.pollIntervalMs = opts.pollIntervalMs ?? 10_000;
    this.fetchTxs = opts.fetchTransactions ?? defaultGetTxs;
    this.supabase = opts.supabase !== undefined ? opts.supabase : getSupabase();
    this.notificationQueue = opts.notificationQueue ?? null;
    this.registry = new ContractRegistry(opts.initialAddresses ?? []);
  }

  getRegistry(): ContractRegistry {
    return this.registry;
  }

  getState(address: string): IndexerState {
    return (
      this.cursors.get(address) ?? { lastProcessedLt: 0n, lastProcessedHash: null }
    );
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.registry.loadFromDb().catch((err) => logger.warn({ err }, 'registry load failed'));
    await this.loadCursors();
    logger.info({ contracts: this.registry.list().length }, 'event indexer started');
    this.scheduleNext(0);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Process one polling cycle for all registered contracts. Exposed for tests. */
  async tick(): Promise<void> {
    const addrs = this.registry.list();
    for (const addr of addrs) {
      const cursor = this.cursors.get(addr) ?? { lastProcessedLt: 0n, lastProcessedHash: null };
      let events: RawTxEvent[];
      try {
        events = await this.fetchTxs(addr, cursor.lastProcessedLt);
      } catch (err) {
        logger.error({ err, addr }, 'fetchTransactions failed');
        throw err;
      }
      // Sort ascending by lt so we always advance the cursor monotonically.
      events.sort((a, b) => (a.lt < b.lt ? -1 : a.lt > b.lt ? 1 : 0));
      for (const ev of events) {
        await this.processEvent(addr, ev);
        cursor.lastProcessedLt = ev.lt;
        cursor.lastProcessedHash = ev.txHash;
      }
      this.cursors.set(addr, cursor);
      if (events.length > 0) await this.saveCursor(addr, cursor);
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      try {
        await this.tick();
        this.backoffMs = 5000;
        this.scheduleNext(this.pollIntervalMs);
      } catch (err) {
        logger.warn({ err, backoffMs: this.backoffMs }, 'indexer tick failed; backing off');
        const delay = this.backoffMs;
        this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
        this.scheduleNext(delay);
      }
    }, delayMs);
  }

  private async loadCursors(): Promise<void> {
    if (!this.supabase) return;
    const { data, error } = await this.supabase.from('indexer_state').select('*');
    if (error) {
      logger.warn({ err: error.message }, 'failed to load indexer_state');
      return;
    }
    for (const row of data ?? []) {
      this.cursors.set(row.contract_address as string, {
        lastProcessedLt: BigInt((row.last_processed_lt ?? 0) as string | number),
        lastProcessedHash: (row.last_processed_hash as string) ?? null,
      });
    }
  }

  private async saveCursor(address: string, cursor: IndexerState): Promise<void> {
    if (!this.supabase) return;
    const { error } = await this.supabase.from('indexer_state').upsert(
      {
        contract_address: address,
        last_processed_lt: cursor.lastProcessedLt.toString(),
        last_processed_hash: cursor.lastProcessedHash,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'contract_address' },
    );
    if (error) logger.warn({ err: error.message }, 'failed to persist indexer_state');
  }

  /** Insert event row idempotently and apply derived-table side effects. */
  async processEvent(contractAddress: string, raw: RawTxEvent): Promise<void> {
    const { txHash, lt, event } = raw;
    const kyeId = await this.resolveKyeId(contractAddress, event);

    const inserted = await this.insertEvent(kyeId, txHash, lt, event);
    if (!inserted) {
      // Duplicate — idempotency guarantee. Skip side effects.
      return;
    }

    try {
      await this.applySideEffects(contractAddress, kyeId, event);
    } catch (err) {
      logger.error({ err, type: event.type }, 'side-effect application failed');
    }

    await this.enqueueNotifications(kyeId, inserted.id, event);
  }

  private async insertEvent(
    kyeId: string | null,
    txHash: string,
    lt: bigint,
    event: DecodedEvent,
  ): Promise<{ id: string } | null> {
    if (!this.supabase) {
      // No DB → simulate insertion (used in unit tests via in-memory store).
      return { id: `${txHash}:${event.type}:${lt}` };
    }
    const { data, error } = await this.supabase
      .from('events')
      .upsert(
        {
          kye_id: kyeId,
          event_type: event.type,
          payload: event.payload,
          tx_hash: txHash,
          lt: lt.toString(),
        },
        { onConflict: 'tx_hash,event_type,lt', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle();
    if (error) {
      logger.warn({ err: error.message }, 'event insert failed');
      return null;
    }
    return data ? { id: data.id as string } : null;
  }

  private async resolveKyeId(contractAddress: string, event: DecodedEvent): Promise<string | null> {
    if (!this.supabase) return null;
    if (event.type === 'KyeCreated') return null; // not yet inserted
    const { data } = await this.supabase
      .from('kyes')
      .select('id')
      .eq('contract_address', contractAddress)
      .maybeSingle();
    return (data?.id as string) ?? null;
  }

  private async applySideEffects(
    contractAddress: string,
    kyeId: string | null,
    event: DecodedEvent,
  ): Promise<void> {
    const sb = this.supabase;
    if (!sb) return;
    const p = event.payload as Record<string, string | number>;

    switch (event.type) {
      case 'KyeCreated': {
        // Insert minimal kyes row (organizer/name to be enriched by backend on /createKye).
        await sb.from('kyes').upsert(
          {
            contract_address: contractAddress,
            organizer_id: await this.userIdByWallet(p.organizer as string),
            name: 'Kye',
            params: { memberCount: p.memberCount },
            status: 'created',
          },
          { onConflict: 'contract_address', ignoreDuplicates: true },
        );
        this.registry.register(contractAddress);
        break;
      }
      case 'MemberJoined': {
        if (!kyeId) break;
        const userId = await this.userIdByWallet(p.member as string);
        if (!userId) break;
        await sb.from('kye_members').upsert(
          {
            kye_id: kyeId,
            user_id: userId,
            order_num: p.orderNum as number,
            status: 'active',
          },
          { onConflict: 'kye_id,user_id', ignoreDuplicates: true },
        );
        break;
      }
      case 'KyeActivated': {
        if (kyeId) await sb.from('kyes').update({ status: 'active' }).eq('id', kyeId);
        break;
      }
      case 'RoundExecuted': {
        if (!kyeId) break;
        const winnerId = await this.userIdByWallet(p.winner as string);
        await sb.from('rounds').upsert(
          {
            kye_id: kyeId,
            round_num: p.roundNum as number,
            scheduled_at: new Date().toISOString(),
            executed_at: new Date().toISOString(),
            winner_id: winnerId,
            payout: p.payout as string,
          },
          { onConflict: 'kye_id,round_num' },
        );
        if (winnerId) {
          await sb
            .from('kye_members')
            .update({ status: 'paid' })
            .eq('kye_id', kyeId)
            .eq('user_id', winnerId);
        }
        break;
      }
      case 'DefaultDetected': {
        if (!kyeId) break;
        const userId = await this.userIdByWallet(p.member as string);
        if (userId) {
          await sb
            .from('kye_members')
            .update({ status: 'defaulted' })
            .eq('kye_id', kyeId)
            .eq('user_id', userId);
        }
        // Append to rounds.defaulted_members.
        const { data: round } = await sb
          .from('rounds')
          .select('id,defaulted_members')
          .eq('kye_id', kyeId)
          .eq('round_num', p.roundNum as number)
          .maybeSingle();
        if (round && userId) {
          const list = Array.isArray(round.defaulted_members) ? round.defaulted_members : [];
          if (!list.includes(userId)) list.push(userId);
          await sb.from('rounds').update({ defaulted_members: list }).eq('id', round.id);
        }
        break;
      }
      case 'KyeCompleted':
        if (kyeId) await sb.from('kyes').update({ status: 'completed' }).eq('id', kyeId);
        break;
      case 'KyeCancelled':
        if (kyeId) await sb.from('kyes').update({ status: 'cancelled' }).eq('id', kyeId);
        break;
      default:
        break;
    }
  }

  private async userIdByWallet(wallet: string | undefined): Promise<string | null> {
    if (!wallet || !this.supabase) return null;
    const { data } = await this.supabase
      .from('users')
      .select('id')
      .eq('wallet_address', wallet)
      .maybeSingle();
    return (data?.id as string) ?? null;
  }

  private async enqueueNotifications(
    kyeId: string | null,
    eventId: string,
    event: DecodedEvent,
  ): Promise<void> {
    const matrix = NOTIFICATION_MATRIX[event.type] ?? [];
    if (matrix.length === 0 || !this.notificationQueue) return;
    for (const entry of matrix) {
      try {
        await this.notificationQueue.add('notify', {
          kyeId,
          eventId,
          eventType: event.type,
          payload: event.payload,
          audience: entry.audience,
          channel: entry.channel,
        });
      } catch (err) {
        logger.warn({ err }, 'failed to enqueue notification');
      }
    }
  }
}

/** Build a default BullMQ notification queue (named `notification_queue`). */
export function createNotificationQueue(redisUrl: string): Queue {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
  return new Queue('notification_queue', { connection });
}
