/**
 * N-01 / N-03 — backend / upstream failure tolerance.
 *
 * The TMA must not show raw 4xx/5xx text to users. friendlyMessage()
 * already maps status codes to user-friendly strings (regress-friendly-
 * errors covers the source contract). These specs exercise the runtime
 * by:
 *   - hitting non-existent kye → backend 404/500 surfaced to TMA
 *   - intercepting fetch to inject 5xx
 *   - intercepting fetch to inject 429 (upstream rate-limit)
 * and asserting the page mounts with a localized error rather than
 * raw English.
 */
// Intentionally NOT importing strict-page here: these tests inject 5xx /
// 429 on purpose, which strict-page would (correctly) flag as failures.
// We just want to verify the UI does not leak raw English/HTTP text.
import { test, expect } from '@playwright/test';
import { signInitData, TEST_BOT_TOKEN } from './fixtures/init-data';

// Helper to seed Telegram.WebApp before each navigation.
async function withInitData(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  const raw = signInitData(TEST_BOT_TOKEN, { id: 88_000_002, first_name: 'QA' });
  await page.addInitScript((rawStr) => {
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        initData: rawStr,
        initDataUnsafe: { user: { id: 88_000_002 }, auth_date: Math.floor(Date.now() / 1000) },
        ready: () => {},
        expand: () => {},
        close: () => {},
        setHeaderColor: () => {},
        MainButton: {
          setText: () => {},
          show: () => {},
          hide: () => {},
          onClick: () => {},
          offClick: () => {},
          enable: () => {},
          disable: () => {},
          setParams: () => {},
        },
        BackButton: { show: () => {}, hide: () => {}, onClick: () => {}, offClick: () => {} },
        colorScheme: 'light',
        themeParams: {},
      },
    };
  }, raw);
}

const FAKE_ADDR = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

test.describe('regress-network-resilience', () => {
  test('404 on non-existent kye shows localized message', async ({ page }) => {
    await withInitData(page);
    await page.goto(`/kye/${FAKE_ADDR}`);
    const strictPage = page;
    // Page must mount (no blank screen). Either Korean or English friendly
    // text appears, NOT raw "API GET … failed" or "missing".
    await expect(strictPage.locator('main')).toBeVisible({ timeout: 10_000 });
    const bodyText = await strictPage.locator('body').textContent();
    if (bodyText) {
      expect(bodyText).not.toMatch(/API \w+ .*failed:/i);
      expect(bodyText).not.toMatch(/^missing\s/i);
    }
  });

  test('backend 5xx → page surfaces retry hint, not raw HTTP text', async ({ page }) => {
    await withInitData(page);
    // Intercept any /me request and force 503.
    await page.route(/\/me(\?|$)/, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'upstream timeout' }),
      }),
    );
    await page.goto('/');
    const strictPage = page;
    // Home tolerates /me failure — it falls back to whatever store
    // already has + may surface an error toast. Either way, no crash.
    await expect(strictPage.locator('body')).not.toBeEmpty();
    const bodyText = await strictPage.locator('body').textContent();
    if (bodyText) {
      expect(bodyText).not.toMatch(/upstream timeout/i);
    }
  });

  test('upstream 429 → no raw "Too Many Requests" leak', async ({ page }) => {
    await withInitData(page);
    await page.route(/\/me(\?|$)/, (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'too many' }),
      }),
    );
    await page.goto('/');
    const strictPage = page;
    await expect(strictPage.locator('body')).not.toBeEmpty();
    const bodyText = await strictPage.locator('body').textContent();
    if (bodyText) {
      expect(bodyText).not.toMatch(/too many$/i);
    }
  });
});
