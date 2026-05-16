import { test, expect } from './fixtures/strict-page';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression for commit ac33112 — bot deep-link routing.
 *
 * Bot share emits `https://t.me/RoostaApp_Bot/app?startapp=join_<addr>`.
 * Before the fix, the TMA had no code reading `start_param`; users landed
 * on the empty home page and saw no Join button. The fix added a useEffect
 * in `apps/tma/src/components/Providers.tsx` that reads the param from any
 * of: `?tgWebAppStartParam`, `?startapp`, `?start_param`,
 * `WebApp.initDataUnsafe.start_param` — and `router.replace`s to
 * `/join/<addr>` when it starts with `join_`.
 */
const FAKE_ADDR = 'EQDzfhRS8yLpoVp13jTb7IGwYxoa2u9gchJXrUmEiJhmWL4Y';

const PROVIDERS = path.join(
  __dirname, '..', 'apps', 'tma', 'src', 'components', 'Providers.tsx',
);

test.describe('regress-startapp-routing — source contract', () => {
  test('Providers reads start_param from all four sources', () => {
    const src = fs.readFileSync(PROVIDERS, 'utf8');
    expect(src).toContain('tgWebAppStartParam');
    expect(src).toContain('startapp');
    expect(src).toContain('start_param');
    // Telegram-native source must also be checked.
    expect(src).toMatch(/initDataUnsafe[\s\S]{0,80}start_param/);
  });

  test('Providers routes to /join/<addr> when start_param is join_<addr>', () => {
    const src = fs.readFileSync(PROVIDERS, 'utf8');
    expect(src).toMatch(/startsWith\(['"]join_['"]\)/);
    expect(src).toMatch(/router\.replace\(`\/join\/\$\{addr\}`\)/);
  });
});

test.describe('regress-startapp-routing — browser behaviour', () => {
  test('?startapp=join_<addr> on / lands on /join/<addr>', async ({ strictPage, withInitData }) => {
    test.setTimeout(60_000);
    await withInitData();
    await strictPage.goto(`/?startapp=join_${FAKE_ADDR}`, { waitUntil: 'networkidle' });
    // The redirect runs inside a useEffect that awaits getWebApp(); allow
    // generous time in dev mode (StrictMode double-invokes effects).
    await strictPage.waitForURL(new RegExp(`/join/${FAKE_ADDR}`), { timeout: 20_000 });
  });

  test('?tgWebAppStartParam=join_<addr> on / also routes', async ({ strictPage, withInitData }) => {
    test.setTimeout(60_000);
    await withInitData();
    await strictPage.goto(`/?tgWebAppStartParam=join_${FAKE_ADDR}`, { waitUntil: 'networkidle' });
    await strictPage.waitForURL(new RegExp(`/join/${FAKE_ADDR}`), { timeout: 20_000 });
  });

  test('non-join start_param does not redirect', async ({ strictPage, withInitData }) => {
    test.setTimeout(30_000);
    await withInitData();
    await strictPage.goto('/?startapp=something_else', { waitUntil: 'networkidle' });
    // Stay on / (with the param)
    expect(strictPage.url()).toMatch(/\/?\?startapp=something_else/);
  });
});
