import { defineConfig, devices } from '@playwright/test';

/**
 * Roosta-TG E2E config.
 *
 * - PLAYWRIGHT_USE_PROD=1 boots prod builds of backend + TMA (mirror of the
 *   Solana QA config). The default (dev mode) is faster for inner loop.
 * - Backend runs on PORT 3101, TMA on 3100 so they don't collide with
 *   Telegram TMA dev servers or the Solana QA's 3100.
 * - We pre-seed test-time env (TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_API_BASE) so
 *   the initData helper in e2e/fixtures/init-data.ts can sign requests the
 *   backend will accept. The token here is a fake constant — production
 *   Railway/Vercel deploys use the real token from their env stores. We use
 *   the same fake token on BOTH sides (server + signer) so HMAC matches.
 */
const TMA_PORT = Number(process.env.PLAYWRIGHT_TMA_PORT ?? 3100);
const BACKEND_PORT = Number(process.env.PLAYWRIGHT_BACKEND_PORT ?? 3101);
const USE_PROD = process.env.PLAYWRIGHT_USE_PROD === '1';

const TEST_BOT_TOKEN = process.env.PLAYWRIGHT_BOT_TOKEN ?? 'qa-fake-bot-token';

// Optional: pass real Supabase + TON env so the backend actually serves
// /me, /kyes/:id, /relay with live data. Loaded from secrets.local.json
// by scripts/qa-with-secrets.mjs OR set explicitly on the env. Without
// these the backend boots in "no DB" mode and most routes 500 — strict-
// page already tolerates that for routing-only specs, but the seeded-
// integration specs require them.
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const TON_NETWORK = process.env.TON_NETWORK ?? 'testnet';
const TON_API_ENDPOINT =
  process.env.TON_API_ENDPOINT ?? 'https://testnet.toncenter.com/api/v2/jsonRPC';

const tmaCmd = USE_PROD
  ? `pnpm --filter tma build && pnpm --filter tma exec next start -p ${TMA_PORT}`
  : `pnpm --filter tma exec next dev -p ${TMA_PORT}`;

const backendCmd = USE_PROD
  ? `pnpm --filter backend build && PORT=${BACKEND_PORT} node apps/backend/dist/index.js`
  : `PORT=${BACKEND_PORT} pnpm --filter backend dev`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${TMA_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Do NOT set extraHTTPHeaders globally — Playwright sends the header
    // on EVERY request including third-party (TonConnect SDK fetches
    // https://config.ton.org), which trips CORS preflight there.
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      command: backendCmd,
      url: `http://127.0.0.1:${BACKEND_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        PORT: String(BACKEND_PORT),
        TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
        NODE_ENV: USE_PROD ? 'production' : 'development',
        ...(SUPABASE_URL ? { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } : {}),
        TON_NETWORK,
        TON_API_ENDPOINT,
      },
    },
    {
      command: tmaCmd,
      url: `http://127.0.0.1:${TMA_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        PORT: String(TMA_PORT),
        NEXT_PUBLIC_API_BASE: `http://127.0.0.1:${BACKEND_PORT}`,
        NODE_ENV: USE_PROD ? 'production' : 'development',
      },
    },
  ],
});
