import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { loadEnv } from '@roosta/shared/env';
import { logger } from './lib/logger.js';
import { initDataMiddleware } from './middleware/initData.js';
import { serviceOrInitDataMiddleware } from './middleware/serviceAuth.js';
import { kyes } from './routes/kyes.js';
import { me } from './routes/me.js';
import { relay } from './routes/relay.js';
import { EventIndexer } from './indexer/indexer.js';

const env = loadEnv();

if (env.SENTRY_DSN) {
  // Conditional dynamic import via variable specifier so TS doesn't resolve the type.
  const specifier = '@sentry/node';
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  (import(specifier) as Promise<{ init: (opts: { dsn: string }) => void }>)
    .then((Sentry) => Sentry.init({ dsn: env.SENTRY_DSN as string }))
    .catch(() => logger.warn('Sentry not installed; skipping'));
}

const app = new Hono();

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (/^https:\/\/([a-z0-9-]+\.)*vercel\.app$/.test(origin)) return origin;
      if (/^https:\/\/([a-z0-9-]+\.)*roosta\.app$/.test(origin)) return origin;
      if (origin === 'http://localhost:3000') return origin;
      return null;
    },
    allowHeaders: [
      'Authorization',
      'Content-Type',
      'X-Telegram-Init-Data',
      'X-Service-Token',
      'X-Service-Telegram-Id',
    ],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 600,
  }),
);

app.get('/health', (c) => c.json({ ok: true, ts: Math.floor(Date.now() / 1000) }));

// Auth: routes below require Telegram initData (no-op in dev when token missing).
// The bot uses `X-Service-Token` + `X-Service-Telegram-Id` to bypass initData
// on a narrow set of endpoints it needs to call.
const serviceMw = serviceOrInitDataMiddleware(
  env.TELEGRAM_BOT_TOKEN,
  process.env.SERVICE_TOKEN,
);
app.use('/me', serviceMw);
app.use('/me/notification-settings', serviceMw);
app.use('/me/*', initDataMiddleware(env.TELEGRAM_BOT_TOKEN));
app.use('/kyes', initDataMiddleware(env.TELEGRAM_BOT_TOKEN));
app.use('/relay', initDataMiddleware(env.TELEGRAM_BOT_TOKEN));
app.use('/relay/*', initDataMiddleware(env.TELEGRAM_BOT_TOKEN));
// Bot reads kye detail via GET /kyes/:id; other /kyes/* (POST create, join, rounds)
// stay under strict initData auth.
app.use('/kyes/:id', async (c, next) => {
  if (c.req.method === 'GET') return serviceMw(c, next);
  return initDataMiddleware(env.TELEGRAM_BOT_TOKEN)(c, next);
});
app.use('/kyes/*', initDataMiddleware(env.TELEGRAM_BOT_TOKEN));

app.route('/me', me);
app.route('/kyes', kyes);
app.route('/relay', relay);

const indexer = new EventIndexer();
void indexer.start();

const port = env.BACKEND_PORT ?? env.PORT;
serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`backend listening on :${info.port}`);
});
