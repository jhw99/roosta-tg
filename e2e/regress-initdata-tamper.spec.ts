/**
 * I-03 / I-04 — initData expiry + tampering.
 *
 * The backend verifier (apps/backend/src/middleware/initData.ts) rejects:
 *   - missing hash
 *   - wrong hash (any field tampered)
 *   - auth_date older than 24h
 *   - auth_date more than 60s in the future
 *
 * These specs confirm those rejections so a regression (e.g., loosened
 * HMAC, missing auth_date check) is caught immediately.
 */
import { test, expect } from './fixtures/strict-page';
import { signInitData, TEST_BOT_TOKEN } from './fixtures/init-data';
import { createHmac } from 'node:crypto';

const BACKEND = `http://127.0.0.1:${process.env.PLAYWRIGHT_BACKEND_PORT ?? 3101}`;
const TEST_USER = { id: 88_000_001, first_name: 'QA', language_code: 'ko' };

test.describe('@integration initData tamper / expiry', () => {
  test('missing hash → 401', async ({ request }) => {
    const res = await request.get(`${BACKEND}/me`, {
      headers: { 'x-telegram-init-data': 'user=%7B%22id%22%3A1%7D&auth_date=1' },
    });
    expect(res.status()).toBe(401);
  });

  test('wrong hash → 401 (HMAC mismatch)', async ({ request }) => {
    const raw = signInitData(TEST_BOT_TOKEN, TEST_USER);
    // Replace last char of the hash with a different one.
    const params = new URLSearchParams(raw);
    const h = params.get('hash')!;
    const flipped = h.endsWith('0') ? h.slice(0, -1) + '1' : h.slice(0, -1) + '0';
    params.set('hash', flipped);
    const res = await request.get(`${BACKEND}/me`, {
      headers: { 'x-telegram-init-data': params.toString() },
    });
    expect(res.status()).toBe(401);
  });

  test('expired auth_date (>24h) → 401', async ({ request }) => {
    // Build initData with auth_date 25h ago. Hash properly.
    const params = new URLSearchParams();
    params.set('user', JSON.stringify(TEST_USER));
    params.set('auth_date', String(Math.floor(Date.now() / 1000) - 25 * 3600));
    params.set('query_id', 'qa_stale');
    const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(TEST_BOT_TOKEN).digest();
    const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
    params.set('hash', hash);
    const res = await request.get(`${BACKEND}/me`, {
      headers: { 'x-telegram-init-data': params.toString() },
    });
    expect(res.status()).toBe(401);
  });

  test('valid initData → NOT 401 (control)', async ({ request }) => {
    const raw = signInitData(TEST_BOT_TOKEN, TEST_USER);
    const res = await request.get(`${BACKEND}/me`, {
      headers: { 'x-telegram-init-data': raw },
    });
    expect(res.status()).not.toBe(401);
  });
});
