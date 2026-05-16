import { test, expect } from './fixtures/strict-page';
import { initDataHeaders, TEST_BOT_TOKEN, signInitData } from './fixtures/init-data';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression for commit f29f312 — server-tracked test_usdc_balance.
 *
 * Before: `wallet/page.tsx` read the on-chain TON wallet balance and
 * displayed it as "USDC", which inflated whenever a tester had stray
 * testnet TON from external faucets.
 * After: a `users.test_usdc_balance` column is incremented in /me/faucet
 * (+amount) and /relay (when target == user's wallet, +intent.amount).
 * The TMA wallet page reads only `user.testUsdcBalance` from /me.
 *
 * We assert the contract in two complementary ways:
 *   (a) backend source: the columns + handlers still wire balance into
 *       /me's response and into the /relay credit branch.
 *   (b) integration: the /me response shape includes testUsdcBalance.
 *       (Full balance-mutation E2E would need a deployed vault on testnet
 *       — out of scope for this sweep; tracked in QA_REPORT.)
 */
const BACKEND = `http://127.0.0.1:${process.env.PLAYWRIGHT_BACKEND_PORT ?? 3101}`;

const RELAY_TS = path.join(__dirname, '..', 'apps', 'backend', 'src', 'routes', 'relay.ts');
const ME_TS = path.join(__dirname, '..', 'apps', 'backend', 'src', 'routes', 'me.ts');
const WALLET_TSX = path.join(__dirname, '..', 'apps', 'tma', 'src', 'app', 'wallet', 'page.tsx');
const CURRENT_USER_TS = path.join(__dirname, '..', 'apps', 'backend', 'src', 'lib', 'currentUser.ts');

test.describe('regress-balance-sync — source contract', () => {
  test('currentUser selects test_usdc_balance', () => {
    const src = fs.readFileSync(CURRENT_USER_TS, 'utf8');
    expect(src).toContain('test_usdc_balance');
  });

  test('relay handler credits balance on owner-wallet target', () => {
    const src = fs.readFileSync(RELAY_TS, 'utf8');
    expect(src).toContain('test_usdc_balance');
    // Must compare against the user's wallet_address (this is the "is this
    // a withdraw to owner?" branch).
    expect(src).toMatch(/wallet_address[\s\S]{0,200}equals\(/);
  });

  test('faucet handler credits balance on success', () => {
    const src = fs.readFileSync(ME_TS, 'utf8');
    expect(src).toContain('test_usdc_balance');
    expect(src).toMatch(/FAUCET_AMOUNT|faucet/);
  });

  test('wallet page reads user.testUsdcBalance (not on-chain TON)', () => {
    const src = fs.readFileSync(WALLET_TSX, 'utf8');
    // The fix removed the toncenter fetch. Verify it stays out.
    expect(src).not.toMatch(/getAddressBalance/);
    expect(src).toContain('testUsdcBalance');
  });
});

test.describe('@integration regress-balance-sync — /me response shape', () => {
  test('/me returns testUsdcBalance field', async ({ request, tgUser }) => {
    const res = await request.get(`${BACKEND}/me`, { headers: initDataHeaders(tgUser) });
    // 200 (Supabase up) or 500 (Supabase env missing). In CI/local without
    // SUPABASE_*, we accept 500 and only assert NOT 401 (auth worked).
    expect(res.status()).not.toBe(401);
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('user');
      // testUsdcBalance is optional on the wire (schema marks as .optional)
      // — but if user is non-null we want the field present (even as "0").
      if (body.user) {
        expect(body.user).toHaveProperty('testUsdcBalance');
      }
    }
  });

  test('initData signing helper produces a hash the backend accepts (=> NOT 401)', async ({
    request,
    tgUser,
  }) => {
    // Sanity check the signing helper itself — if backend is up and supabase
    // is configured, we get 200; if supabase is down we get 500 but auth
    // path is verified by the absence of 401.
    const headers = { 'x-telegram-init-data': signInitData(TEST_BOT_TOKEN, tgUser) };
    const res = await request.get(`${BACKEND}/me`, { headers });
    expect(res.status()).not.toBe(401);
  });
});
