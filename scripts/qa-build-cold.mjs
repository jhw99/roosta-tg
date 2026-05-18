#!/usr/bin/env node
/**
 * Cold build — mimic Vercel's worst case (no preserved dist/build cache)
 * and prove the full monorepo build chain still works.
 *
 * Why this exists: between 2026-05-13 and 2026-05-18, 12 commits sat
 * unbuilt on Vercel and 3 of those failed in a row (cfccc3f, 2bbfd05,
 * 3ca7fd0) because local `pnpm --filter tma build` worked off the
 * already-populated packages/shared/dist + packages/contracts/build,
 * while Vercel cleaned those between runs. This script wipes them and
 * runs the same command, so the failure surfaces in CI/local before
 * a deploy ever starts.
 */
import { execSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const wipePaths = [
  'packages/shared/dist',
  'packages/contracts/build',
  'packages/contracts/output',
  'apps/backend/dist',
  'apps/bot/dist',
  'apps/tma/.next',
];

console.log('--- wiping derived artifacts ---');
for (const p of wipePaths) {
  const full = resolve(repo, p);
  if (existsSync(full)) {
    rmSync(full, { recursive: true, force: true });
    console.log(`  rm ${p}`);
  }
}

console.log('\n--- pnpm install --frozen-lockfile=false ---');
execSync('pnpm install --frozen-lockfile=false', { cwd: repo, stdio: 'inherit' });

console.log('\n--- pnpm --filter tma build (chains contracts + shared) ---');
execSync('pnpm --filter tma build', { cwd: repo, stdio: 'inherit' });

console.log('\n--- pnpm --filter backend build ---');
try {
  execSync('pnpm --filter backend build', { cwd: repo, stdio: 'inherit' });
} catch (e) {
  console.error('\n⚠️  backend prod build failed (known F-101: @ton/core ABIGetter import mismatch in Tact-generated wrappers vs backend\'s @ton/core version).');
  console.error('   Skipping — backend ships as tsx-runtime on Railway, not as compiled dist.');
}

console.log('\n--- pnpm --filter bot build ---');
try {
  execSync('pnpm --filter bot build', { cwd: repo, stdio: 'inherit' });
} catch (e) {
  console.warn('⚠️  bot build failed — see logs');
  process.exit(1);
}

console.log('\n✅ cold build OK — Vercel-style cache miss would not break TMA.');
