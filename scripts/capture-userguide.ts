/**
 * capture-userguide.ts
 *
 * Generates the 13 user-guide screenshots referenced by
 * `docs/USER_GUIDE_ORGANIZER.md` and `docs/USER_GUIDE_MEMBER.md`.
 *
 * Strategy:
 *   1. Detect existing dev server on http://localhost:3000.
 *      If none, spawn `pnpm --filter tma dev` and wait for readiness.
 *   2. Drive the TMA in `?demo=1` mode, which short-circuits API calls
 *      and seeds the Zustand store with mock user / kyes (see
 *      apps/tma/src/lib/demoSeed.ts and components/Providers.tsx).
 *   3. Visit each route, perform a few interactions, and capture PNGs
 *      to `docs/screenshots/` at a 1280x800 viewport.
 *
 * Usage:
 *   pnpm tsx scripts/capture-userguide.ts
 *
 * Requirements:
 *   - playwright @ ^1 must be installed:
 *       pnpm add -Dw playwright && pnpm exec playwright install chromium
 *
 * NOTE: This script is the canonical capture flow. The PNGs currently in
 * `docs/screenshots/` were produced by a fallback renderer (see
 * `scripts/capture-userguide-fallback.py`) because the sandbox in which
 * this script was authored does not have Playwright/Chromium available.
 * Re-run this script in a normal dev environment to replace them with
 * real TMA captures.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// Dynamic import so the file type-checks even when playwright is absent.
type Browser = import('playwright').Browser;
type Page = import('playwright').Page;

const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'docs/screenshots');
const BASE = process.env.TMA_BASE ?? 'http://localhost:3000';
const MOCK_ADDRESS = 'EQDemoKyeAddressForGuideScreenshotsxxxxxxxxxxx';

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(1500) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerUp()) return;
    await sleep(1000);
  }
  throw new Error(`TMA dev server did not become ready at ${BASE} within ${timeoutMs}ms`);
}

async function maybeSpawnDev(): Promise<ChildProcess | null> {
  if (await isServerUp()) {
    console.log(`[capture] reusing existing dev server at ${BASE}`);
    return null;
  }
  console.log('[capture] spawning `pnpm --filter tma dev`');
  const child = spawn('pnpm', ['--filter', 'tma', 'dev'], {
    cwd: ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, NEXT_PUBLIC_DEMO_ALLOWED: '1' },
  });
  await waitForServer();
  return child;
}

interface Shot {
  file: string;
  url: string;
  prepare?: (page: Page) => Promise<void>;
}

const SHOTS: Shot[] = [
  // Organizer flow
  {
    file: 'organizer-1.png',
    url: `${BASE}/?demo=1&seed=empty`,
  },
  {
    file: 'organizer-2.png',
    url: `${BASE}/create?demo=1`,
    prepare: async (page) => {
      await page.getByLabel(/name|이름/i).fill('Friends 6');
      await page.getByLabel(/description|설명/i).fill('Weekly kye, 6 members');
    },
  },
  {
    file: 'organizer-3.png',
    url: `${BASE}/create?demo=1&expand=risk`,
    prepare: async (page) => {
      const btn = page.getByRole('button', { name: /risk|위험|parameters/i }).first();
      if (await btn.isVisible().catch(() => false)) await btn.click();
    },
  },
  {
    file: 'organizer-4.png',
    url: `${BASE}/create?demo=1&preview=payout`,
  },
  {
    file: 'organizer-5.png',
    url: `${BASE}/create?demo=1&step=invite`,
  },
  {
    file: 'organizer-6.png',
    url: `${BASE}/kye/${MOCK_ADDRESS}?demo=1&view=default`,
  },
  {
    file: 'organizer-7.png',
    url: `${BASE}/?demo=1&seed=populated`,
  },
  // Member flow
  {
    file: 'member-1.png',
    url: `${BASE}/join/${MOCK_ADDRESS}?demo=1&step=preview`,
  },
  {
    file: 'member-2.png',
    url: `${BASE}/join/${MOCK_ADDRESS}?demo=1&step=slot`,
  },
  {
    file: 'member-3.png',
    url: `${BASE}/join/${MOCK_ADDRESS}?demo=1&step=consent`,
  },
  {
    file: 'member-4.png',
    url: `${BASE}/kye/${MOCK_ADDRESS}?demo=1&view=member`,
  },
  {
    file: 'member-5.png',
    url: `${BASE}/kye/${MOCK_ADDRESS}/rounds?demo=1`,
  },
  {
    file: 'member-6.png',
    url: `${BASE}/wallet?demo=1&connected=1`,
  },
];

async function runWithPlaywright(): Promise<void> {
  let pw: typeof import('playwright');
  try {
    pw = await import('playwright');
  } catch (e) {
    throw new Error(
      'Playwright is not installed. Run:\n' +
        '  pnpm add -Dw playwright\n' +
        '  pnpm exec playwright install chromium\n' +
        'Original error: ' + (e as Error).message,
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const execPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome`;
  const browser: Browser = await pw.chromium.launch({ executablePath: execPath });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    for (const shot of SHOTS) {
      console.log(`[capture] ${shot.file}  <-  ${shot.url}`);
      try {
        await page.goto(shot.url, { waitUntil: 'networkidle', timeout: 20_000 });
      } catch (e) {
        console.warn(`[capture] goto for ${shot.file} timed out:`, (e as Error).message);
      }
      if (shot.prepare) {
        try {
          await shot.prepare(page);
        } catch (e) {
          console.warn(`[capture] prepare for ${shot.file} failed:`, (e as Error).message);
        }
      }
      await page.waitForTimeout(1500);
      await page.screenshot({ path: resolve(OUT_DIR, shot.file), fullPage: false });
    }
    await context.close();
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const child = await maybeSpawnDev();
  try {
    await runWithPlaywright();
    console.log(`[capture] done. ${SHOTS.length} files in ${OUT_DIR}`);
  } finally {
    if (child) child.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('[capture] FAILED:', err);
  process.exit(1);
});
