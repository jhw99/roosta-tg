import { createHmac } from 'node:crypto';

/**
 * Generate a Telegram initData string that the backend's verifier
 * (apps/backend/src/middleware/initData.ts) will accept.
 *
 * Match logic:
 *   secretKey = HMAC-SHA256('WebAppData', botToken)
 *   hash      = HMAC-SHA256(secretKey, dataCheckString)
 * where dataCheckString = sorted params joined by `\n` as `key=value`,
 * EXCLUDING the `hash` field itself.
 *
 * Important: tests must use the same `botToken` value that the running
 * backend process uses (see playwright.config.ts webServer.env).
 */
export interface TestTgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export function signInitData(botToken: string, user: TestTgUser): string {
  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', `qa_${Math.random().toString(36).slice(2, 10)}`);

  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', hash);
  return params.toString();
}

export const TEST_BOT_TOKEN = process.env.PLAYWRIGHT_BOT_TOKEN ?? 'qa-fake-bot-token';

/** Convenience: build the request headers object the backend expects. */
export function initDataHeaders(user: TestTgUser, botToken = TEST_BOT_TOKEN): Record<string, string> {
  return {
    'x-telegram-init-data': signInitData(botToken, user),
    'content-type': 'application/json',
  };
}
