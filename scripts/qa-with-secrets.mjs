#!/usr/bin/env node
/**
 * Wrap a child command with Supabase/TON env loaded from secrets.local.json.
 * Used by `qa:e2e:full` to give Playwright a backend that actually serves
 * /me + /kyes/:id with real data.
 *
 * Usage: node scripts/qa-with-secrets.mjs -- playwright test ...
 */
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const secretsPath = resolve(root, 'secrets.local.json');

const sepIdx = process.argv.indexOf('--');
const args = sepIdx === -1 ? process.argv.slice(2) : process.argv.slice(sepIdx + 1);
if (args.length === 0) {
  console.error('usage: node scripts/qa-with-secrets.mjs -- <command> [args...]');
  process.exit(2);
}

const env = { ...process.env };

if (existsSync(secretsPath)) {
  const secrets = JSON.parse(readFileSync(secretsPath, 'utf8'));
  const sb = secrets.supabase ?? {};
  if (sb.url) env.SUPABASE_URL = sb.url;
  if (sb.service_role_key) env.SUPABASE_SERVICE_ROLE_KEY = sb.service_role_key;
  if (sb.anon_key) env.SUPABASE_ANON_KEY = sb.anon_key;
  console.log('[qa-with-secrets] loaded Supabase env from secrets.local.json');
} else {
  console.warn('[qa-with-secrets] secrets.local.json not found — running without SUPABASE_*');
}

if (!env.TON_NETWORK) env.TON_NETWORK = 'testnet';

const [cmd, ...cmdArgs] = args;
const child = spawn(cmd, cmdArgs, { stdio: 'inherit', env, shell: false });
child.on('exit', (code) => process.exit(code ?? 1));
