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
// Circle detail + rounds are PUBLIC reads so an invite link works in a plain
// browser (no Telegram initData). Every other /kyes/* route — POST join,
// contribute, cancel, delete, etc. — still requires initData auth.
//
// Hono runs ALL `app.use` middlewares whose pattern matches, so we can't have
// a public /kyes/:id middleware sitting in front of a catch-all initData
// middleware: the catch-all would still run and reject the public GETs. One
// consolidated middleware avoids the double-match.
const PUBLIC_KYE_GET = /^\/kyes\/[^/]+(?:\/rounds)?$/;
app.use('/kyes/*', async (c, next) => {
  if (c.req.method === 'GET' && PUBLIC_KYE_GET.test(c.req.path)) return next();
  return initDataMiddleware(env.TELEGRAM_BOT_TOKEN)(c, next);
});

app.route('/me', me);
app.route('/kyes', kyes);
app.route('/relay', relay);

const indexer = new EventIndexer();
void indexer.start();

const port = env.BACKEND_PORT ?? env.PORT;
serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`backend listening on :${info.port}`);
});
