import { createHmac } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

/**
 * Verify Telegram WebApp initData per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Header: `x-telegram-init-data: <raw initData string>`.
 */
/** Max age (seconds) accepted for Telegram initData. Mitigates capture-replay. */
export const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;

export function verifyInitData(rawInitData: string, botToken: string): Record<string, string> | null {
  const params = new URLSearchParams(rawInitData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computed !== hash) return null;

  // Reject stale initData. Telegram includes `auth_date` (unix seconds).
  const authDateRaw = sorted.find(([k]) => k === 'auth_date')?.[1];
  if (!authDateRaw) return null;
  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate)) return null;
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec < -60 || ageSec > INIT_DATA_MAX_AGE_SEC) return null;

  return Object.fromEntries(sorted);
}

export const initDataMiddleware = (botToken: string | undefined): MiddlewareHandler => async (c, next) => {
  if (!botToken) {
    // Dev mode: allow through but mark unverified.
    c.set('tgUser', null);
    await next();
    return;
  }
  const raw = c.req.header('x-telegram-init-data');
  if (!raw) return c.json({ error: 'missing initData' }, 401);
  const verified = verifyInitData(raw, botToken);
  if (!verified) return c.json({ error: 'invalid initData' }, 401);
  c.set('tgUser', verified);
  await next();
};
