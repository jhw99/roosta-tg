import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { loadEnv } from '@roosta/shared/env';
import { logger } from '../lib/logger.js';
import { createNotificationWorker, type NotificationJob } from './worker.js';
import { ReminderScanner } from './scheduled-reminders.js';

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.error('TELEGRAM_BOT_TOKEN missing — notifications worker cannot send messages');
    process.exit(1);
  }
  const { worker, queue, close } = createNotificationWorker({
    redisUrl: env.REDIS_URL,
    botToken: env.TELEGRAM_BOT_TOKEN,
    tmaUrl: env.TMA_URL,
  });

  // Reminder scanner — every 5 minutes.
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  const reminderQueue = new Queue<NotificationJob>('notification_queue', { connection });
  const scanner = new ReminderScanner({ notificationQueue: reminderQueue });
  const tick = async (): Promise<void> => {
    try {
      const { enqueued } = await scanner.run();
      if (enqueued > 0) logger.info({ enqueued }, 'reminder scan complete');
    } catch (err) {
      logger.warn({ err }, 'reminder scan failed');
    }
  };
  const interval = setInterval(tick, 5 * 60 * 1000);
  void tick();

  logger.info('notification worker + reminder scanner running');

  const shutdown = async (sig: string): Promise<void> => {
    logger.info({ sig }, 'notifications shutting down');
    clearInterval(interval);
    await close();
    await reminderQueue.close().catch(() => undefined);
    await connection.quit().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Keep references to silence lint.
  void worker;
  void queue;
}

void main().catch((err) => {
  logger.error({ err }, 'notifications crashed');
  process.exit(1);
});
