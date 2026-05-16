import { test, expect } from './fixtures/strict-page';

/**
 * Regression for commit 4feb400 — public GET /kyes/:id (and /rounds).
 *
 * Before the fix, Hono's `app.use('/kyes/:id', ...)` middleware sat in
 * FRONT of a catch-all `app.use('/kyes/*', initDataMiddleware)`. Both
 * patterns matched the same request, so the catch-all still ran after
 * the public middleware called next(), and the request was 401'd.
 *
 * The fix consolidated to a single middleware with a regex
 *   PUBLIC_KYE_GET = /^\/kyes\/[^/]+(?:\/rounds)?$/
 * that bypasses initDataMiddleware ONLY for GETs on /kyes/:id and
 * /kyes/:id/rounds, while every other /kyes/* path still requires
 * auth.
 */
const BACKEND = `http://127.0.0.1:${process.env.PLAYWRIGHT_BACKEND_PORT ?? 3101}`;
// Use a clearly-fabricated TON address — backend should respond with the
// shape ("not found" or empty) but NOT 401. We assert on auth behaviour,
// not on data.
const FAKE_ADDRESS = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

test.describe('@integration regress-public-get — invite-link auth', () => {
  test('GET /kyes/:id without initData returns NOT 401', async ({ request }) => {
    const res = await request.get(`${BACKEND}/kyes/${FAKE_ADDRESS}`);
    expect(res.status(), `got ${res.status()} — fix 4feb400 regressed`).not.toBe(401);
    // 200 (real data), 404 (not found), 502 (chain read failed): all OK.
    expect([200, 404, 502, 500]).toContain(res.status());
  });

  test('GET /kyes/:id/rounds without initData returns NOT 401', async ({ request }) => {
    const res = await request.get(`${BACKEND}/kyes/${FAKE_ADDRESS}/rounds`);
    expect(res.status(), `got ${res.status()} — fix 4feb400 regressed`).not.toBe(401);
    expect([200, 404, 502, 500]).toContain(res.status());
  });

  test('POST /kyes/:id/join WITHOUT initData stays 401 (write path still protected)', async ({ request }) => {
    const res = await request.post(`${BACKEND}/kyes/${FAKE_ADDRESS}/join`, {
      data: { orderNum: 1 },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /me without initData stays 401 (regression guard)', async ({ request }) => {
    const res = await request.get(`${BACKEND}/me`);
    expect(res.status()).toBe(401);
  });
});
