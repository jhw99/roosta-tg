import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'src/**/__tests__/**/*.spec.ts'],
    environment: 'node',
  },
});
