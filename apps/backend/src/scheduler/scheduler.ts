import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../lib/logger.js';
import { getSupabase } from '../lib/supabase.js';

export interface ExecuteRoundJobData {
  roundId: string;
  kyeId: string;
  contractAddress: string;
  roundNum: number;
}

export interface SchedulerOptions {
  redisUrl?: string;
  supabase?: SupabaseClient | null;
  /** Tick interval in ms. Default 60_000 (1 minute, per spec). */
  intervalMs?: number;
  now?: () => Date;
}

/**
 * Periodically queries the DB for due rounds and enqueues `execute_round` jobs.
 * Used in conjunction with `executeRoundWorker`.
 */
export class RoundScheduler {
  private readonly supabase: SupabaseClient | null;
  private readonly now: () => Date;
  private readonly intervalMs: number;
  readonly queue: Queue<ExecuteRoundJobData>;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(opts: SchedulerOptions & { queue?: Queue<ExecuteRoundJobData> } = {}) {
    this.supabase = opts.supabase !== undefined ? opts.supabase : getSupabase();
    this.now = opts.now ?? (() => new Date());
    this.intervalMs = opts.intervalMs ?? 60_000;
    if (opts.queue) {
      this.queue = opts.queue;
    } else {
      const redisUrl = opts.redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
      const connection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
      this.queue = new Queue<ExecuteRoundJobData>('scheduler_queue', { connection });
    }
  }

  /** Run a single scan, enqueue jobs, return how many were enqueued. */
  async tick(): Promise<number> {
    if (!this.supabase) return 0;
    const nowIso = this.now().toISOString();
    // We now extend the off-chain grace window to ONE FULL round interval
    // past the deadline (sweep #6, 2026-05-19). The contract's own
    // GRACE_WINDOW_SEC = 300s is a hard floor — anyone can manually
    // trigger ExecuteRound 5 min after deadline — but our scheduler waits
    // a full interval so members get a meaningful catch-up window before
    // the Cancel policy fires automatically. We need `kyes.params` to
    // read roundIntervalSec per circle, so pull that too.
    const { data, error } = await this.supabase
      .from('rounds')
      .select(
        'id, kye_id, round_num, scheduled_at, executed_at, kyes(contract_address, status, params)',
      )
      .lte('scheduled_at', nowIso)
      .is('executed_at', null);
    if (error) {
      logger.warn({ err: error.message }, 'scheduler query failed');
      return 0;
    }
    let count = 0;
    for (const row of (data ?? []) as unknown as Array<{
      id: string;
      kye_id: string;
      round_num: number;
      scheduled_at: string;
      kyes?:
        | { contract_address: string; status: string; params?: Record<string, unknown> }
        | { contract_address: string; status: string; params?: Record<string, unknown> }[];
    }>) {
      const kyeRel = Array.isArray(row.kyes) ? row.kyes[0] : row.kyes;
      if (!kyeRel || kyeRel.status !== 'active') continue;
      // Extended grace: deadline + roundIntervalSec. Members get a full
      // round's worth of catch-up before we trigger the Cancel/ProRata/
      // OrganizerCover policy.
      const intervalSec = Number((kyeRel.params ?? {}).roundIntervalSec ?? 0);
      if (intervalSec > 0) {
        const earliestTriggerSec =
          Math.floor(new Date(row.scheduled_at).getTime() / 1000) + intervalSec;
        const nowSec = Math.floor(this.now().getTime() / 1000);
        if (nowSec < earliestTriggerSec) continue;
      }
      await this.queue.add(
        'execute_round',
        {
          roundId: row.id,
          kyeId: row.kye_id,
          contractAddress: kyeRel.contract_address,
          roundNum: row.round_num,
        },
        {
          // Deterministic jobId — re-running the scan within the same minute
          // before the job completes is a no-op.
          jobId: `execute_round:${row.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
      count++;
    }
    if (count > 0) logger.info({ count }, 'scheduler enqueued due rounds');
    return count;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = async (): Promise<void> => {
      if (!this.running) return;
      try {
        await this.tick();
      } catch (err) {
        logger.warn({ err }, 'scheduler tick crashed');
      }
      this.timer = setTimeout(loop, this.intervalMs);
    };
    void loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
