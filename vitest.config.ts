import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Root-level vitest config used by `pnpm test:e2e`.
// Reuses the contracts workspace setup (registers @ton/test-utils matchers).
// Resolves @ton/* from packages/contracts/node_modules since this test lives
// outside any workspace package.
const contractsNodeModules = path.resolve(__dirname, 'packages/contracts/node_modules');

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.spec.ts'],
    setupFiles: ['./packages/contracts/tests/setup.ts'],
    testTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@ton/sandbox': path.join(contractsNodeModules, '@ton/sandbox'),
      '@ton/core': path.join(contractsNodeModules, '@ton/core'),
      '@ton/test-utils': path.join(contractsNodeModules, '@ton/test-utils'),
      '@ton/crypto': path.join(contractsNodeModules, '@ton/crypto'),
    },
  },
});
