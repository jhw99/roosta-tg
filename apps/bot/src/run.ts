/**
 * Production entry point. Selects polling or webhook mode based on env
 * and stands up a tiny Node HTTP server in webhook mode that:
 *   - validates the X-Telegram-Bot-Api-Secret-Token header,
 *   - serves /health for Railway liveness,
 *   - mounts the webhook callback at /webhook/<TELEGRAM_WEBHOOK_SECRET>.
 */
import http from 'node:http';
import pino from 'pino';
import { webhookCallback } from 'grammy';
import { loadBotConfig } from './config.js';
import { createBot } from './bot.js';
import { BackendClient } from './services/backendClient.js';
import { getSupabase } from './services/supabaseClient.js';
import type { BotDeps } from './deps.js';

async function main(): Promise<void> {
  const cfg = loadBotConfig();
  const logger = pino({ level: cfg.LOG_LEVEL });

  if (!cfg.TELEGRAM_BOT_TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN not set; exiting (set it to run the bot).');
    return;
  }

  if (cfg.SENTRY_DSN) {
    const specifier = '@sentry/node';
    await (import(specifier) as Promise<{ init: (opts: { dsn: string }) => void }>)
      .then((Sentry) => Sentry.init({ dsn: cfg.SENTRY_DSN as string }))
      .catch(() => logger.warn('Sentry not installed; skipping'));
  }

  const deps: BotDeps = {
    logger,
    backend: new BackendClient({
      baseUrl: cfg.BACKEND_URL,
      serviceToken: cfg.BOT_SERVICE_TOKEN,
    }),
    supabase: getSupabase(),
    tmaUrl: cfg.TMA_URL,
    botUsername: cfg.BOT_USERNAME,
  };

  const bot = createBot(cfg.TELEGRAM_BOT_TOKEN, deps);

  if (cfg.TELEGRAM_BOT_MODE === 'webhook') {
    if (!cfg.TELEGRAM_WEBHOOK_URL || !cfg.TELEGRAM_WEBHOOK_SECRET) {
      throw new Error(
        'webhook mode requires TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET (64-char random string)',
      );
    }
    if (cfg.TELEGRAM_WEBHOOK_SECRET.length < 16) {
      throw new Error('TELEGRAM_WEBHOOK_SECRET must be >= 16 chars (recommend 64)');
    }

    await bot.api.setWebhook(cfg.TELEGRAM_WEBHOOK_URL, {
      secret_token: cfg.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query', 'my_chat_member', 'chat_member'],
    });
    const handle = webhookCallback(bot, 'std/http');
    const expectedPath = `${cfg.WEBHOOK_PATH}/${cfg.TELEGRAM_WEBHOOK_SECRET}`;

    const server = http.createServer(async (req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, ts: Math.floor(Date.now() / 1000) }));
        return;
      }
      if (req.method === 'POST' && req.url === expectedPath) {
        const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
        if (headerSecret !== cfg.TELEGRAM_WEBHOOK_SECRET) {
          res.writeHead(401).end();
          return;
        }
        try {
          const body = await readBody(req);
          const request = new Request(`https://bot.local${req.url}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
          });
          const response = await handle(request);
          const headers: Record<string, string> = {};
          response.headers.forEach((v, k) => {
            headers[k] = v;
          });
          res.writeHead(response.status, headers);
          res.end(await response.text());
        } catch (err) {
          logger.error({ err }, 'webhook handler error');
          res.writeHead(500).end();
        }
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(cfg.WEBHOOK_PORT, () => {
      logger.info({ port: cfg.WEBHOOK_PORT, path: expectedPath }, 'bot listening (webhook)');
    });
  } else {
    logger.info('starting long-polling');
    await bot.start({
      allowed_updates: ['message', 'callback_query', 'my_chat_member', 'chat_member'],
      onStart: (info) => logger.info({ username: info.username }, 'polling started'),
    });
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('bot startup failed', err);
  process.exit(1);
});
