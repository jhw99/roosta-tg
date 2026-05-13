import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../lib/logger.js';
import { getSupabase } from '../lib/supabase.js';
import { buildExecuteRoundBody, sendInternalMessage } from './walletService.js';
import type { ExecuteRoundJobData } from './scheduler.js';
import type { NotificationJob } from '../notifications/worker.js';

export interface ExecuteRoundWorkerOptions {
  redisUrl?: string;
  supabase?: SupabaseClient | null;
  /** Inject for tests. */
  send?: (toAddress: string, value: bigint) => Promise<{ seqno: number }>;
  notificationQueue?: Pick<Queue<NotificationJob>, 'add'>;
}

/**
 * BullMQ worker that consumes `execute_round` jobs.
 * Builds and sends an ExecuteRound message to the Kye contract.
 * On terminal failure, marks the round failed and notifies the organizer.
 */
export function createExecuteRoundWorker(opts: ExecuteRoundWorkerOptions = {}): {
  worker: Worker<ExecuteRoundJobData>;
  queue: Queue<ExecuteRoundJobData>;
  close: () => Promise<void>;
} {
  const supabase = opts.supabase !== undefined ? opts.supabase : getSupabase();
  const redisUrl = opts.redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
  const queue = new Queue<ExecuteRoundJobData>('scheduler_queue', { connection });

  const send =
    opts.send ??
    (async (to: string, value: bigint) => {
      const body = buildExecuteRoundBody();
      return sendInternalMessage(to, body, value);
    });

  const worker = new Worker<ExecuteRoundJobData>(
    'scheduler_queue',
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, 'executing round');
      const result = await send(job.data.contractAddress, BigInt(1e8 /* 0.1 TON */));
      logger.info({ result, roundId: job.data.roundId }, 'execute_round sent');
      // Indexer will pick up the resulting RoundExecuted event and update DB.
      return { ok: true, seqno: result.seqno };
    },
    // F-04: serialize within this process. The wallet mutex in walletService
    // adds a second safety net; concurrency:1 here ensures BullMQ never even
    // hands two jobs to the wallet at once.
    { connection, autorun: true, concurrency: 1 },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const attemptsMade = job.attemptsMade;
    const attemptsTotal = job.opts.attempts ?? 1;
    logger.warn(
      { jobId: job.id, attemptsMade, attemptsTotal, err: err?.message },
      'execute_round attempt failed',
    );
    if (attemptsMade < attemptsTotal) return;
    // Terminal failure.
    if (supabase) {
      try {
        await supabase
          .from('rounds')
          .update({ tx_hash: null, defaulted_members: [], executed_at: null })
          .eq('id', job.data.roundId);
      } catch {
        /* best-effort */
      }
      // Look up organizer to notify.
      const { data: kye } = await supabase
        .from('kyes')
        .select('organizer_id')
        .eq('id', job.data.kyeId)
        .maybeSingle();
      if (kye?.organizer_id && opts.notificationQueue) {
        await opts.notificationQueue.add('execute_round_failed', {
          recipientUserId: kye.organizer_id as string,
          eventType: 'default_detected_organizer',
          channel: 'dm',
          payload: {
            kyeId: job.data.kyeId,
            roundNum: job.data.roundNum,
            policy: 'execute_failure',
            actionAt: new Date().toISOString(),
          },
        });
      }
    }
  });

  return {
    worker,
    queue,
    close: async () => {
      await worker.close();
      await queue.close();
      await connection.quit().catch(() => undefined);
    },
  };
}
