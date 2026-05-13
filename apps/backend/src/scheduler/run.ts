import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { loadEnv } from '@roosta/shared/env';
import { logger } from '../lib/logger.js';
import { RoundScheduler } from './scheduler.js';
import { createExecuteRoundWorker } from './executeRoundWorker.js';
import type { NotificationJob } from '../notifications/worker.js';

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.WALLET_MNEMONIC) {
    logger.warn('WALLET_MNEMONIC missing — scheduler will run but execute_round jobs will fail');
  }
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  const notificationQueue = new Queue<NotificationJob>('notification_queue', { connection });

  const scheduler = new RoundScheduler({ redisUrl: env.REDIS_URL });
  const { worker, close } = createExecuteRoundWorker({
    redisUrl: env.REDIS_URL,
    notificationQueue,
  });

  scheduler.start();
  logger.info('round scheduler + executeRound worker running');

  const shutdown = async (sig: string): Promise<void> => {
    logger.info({ sig }, 'scheduler shutting down');
    await scheduler.stop();
    await close();
    await notificationQueue.close().catch(() => undefined);
    await connection.quit().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  void worker; // keep reference
}

void main().catch((err) => {
  logger.error({ err }, 'scheduler crashed');
  process.exit(1);
});
