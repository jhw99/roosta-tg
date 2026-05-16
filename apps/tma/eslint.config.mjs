// Flat config for ESLint 9. Next 16 deprecates `next lint`; QA gate uses
// this minimal config to keep the lint step non-interactive. Tighten as
// codebase rules mature.
import next from 'eslint-config-next';
export default [
  ...next,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
];
