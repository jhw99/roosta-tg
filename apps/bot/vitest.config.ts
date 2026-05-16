import { defineConfig } from 'vitest/config';

/**
 * Override the root-level `vitest.config.ts` (which restricts include to
 * `tests/e2e/**` for the `pnpm test:e2e` script). Without this override
 * the bot's 4 specs under src/__tests__/ are invisible.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
