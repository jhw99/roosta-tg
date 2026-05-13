import { loadEnv } from '@roosta/shared/env';
import { logger } from '../lib/logger.js';
import { EventIndexer, createNotificationQueue } from './indexer.js';

/**
 * Entry point. Run via `pnpm --filter backend indexer`.
 * Exits gracefully if no TON_RPC_URL/TON_API_ENDPOINT is configured.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const tonEndpoint = process.env.TON_RPC_URL ?? env.TON_API_ENDPOINT;
  if (!tonEndpoint) {
    logger.error(
      'TON_RPC_URL (or TON_API_ENDPOINT) is not set. The indexer requires a TON RPC endpoint. Aborting.',
    );
    process.exit(1);
  }

  const queue = createNotificationQueue(env.REDIS_URL);
  const indexer = new EventIndexer({
    notificationQueue: queue,
    initialAddresses: env.TON_FACTORY_ADDRESS ? [env.TON_FACTORY_ADDRESS] : [],
  });

  await indexer.start();

  const shutdown = async (sig: string): Promise<void> => {
    logger.info({ sig }, 'shutting down indexer');
    await indexer.stop();
    await queue.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main().catch((err) => {
  logger.error({ err }, 'indexer crashed');
  process.exit(1);
});
