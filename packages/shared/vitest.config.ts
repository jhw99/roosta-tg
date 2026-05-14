import { defineConfig } from 'vitest/config';

// Local config so `pnpm --filter @roosta/shared test` picks up the unit tests
// under src/ instead of inheriting the repo-root e2e-only config.
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts'],
  },
});
