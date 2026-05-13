import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../lib/logger.js';

/**
 * Round-execution scheduler skeleton.
 *
 * Responsibilities (GSD §3.2, §4.3):
 *  - Enqueue `executeRound` jobs at each Kye's `scheduledAt`.
 *  - Dispatch them by sending a TON internal message to KyeContract.executeRound.
 *  - On failure, emit DefaultDetected and apply default policy.
 */

export interface ExecuteRoundJob {
  kyeId: string;
  kyeAddress: string;
  roundNum: number;
}

export function createScheduler(redisUrl: string) {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
  const queue = new Queue<ExecuteRoundJob>('execute_round', { connection });

  const worker = new Worker<ExecuteRoundJob>(
    'execute_round',
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, 'executeRound job picked up');
      // TODO: build & send TON message to KyeContract.executeRound.
      // TODO: on success, write events row; on failure, enqueue default-handling job.
      return { ok: true };
    },
    { connection, autorun: false },
  );

  return { queue, worker, connection };
}
