/**
 * Sweep #8 — testnet faucet is now unlimited (user direction
 * 2026-05-19). Previously claimed-at gated /me/faucet to once per
 * user; now the route always sends 1000 USDC + credits the
 * server-tracked balance. faucet_claimed_at is still recorded
 * (idempotently — first claim time only) so the join-onboarding
 * can skip the auto-claim on subsequent joins.
 */
import { test, expect } from './fixtures/strict-page';
import fs from 'node:fs';
import path from 'node:path';

const ME = path.join(__dirname, '..', 'apps', 'backend', 'src', 'routes', 'me.ts');
const WALLET = path.join(
  __dirname, '..', 'apps', 'tma', 'src', 'app', 'wallet', 'page.tsx',
);

test.describe('regress-faucet-unlimited — source contract', () => {
  test('backend no longer 409s on already_claimed', () => {
    const src = fs.readFileSync(ME, 'utf8');
    // The OLD `if (user.faucet_claimed_at) return fail(c, 409, 'already_claimed'...)` is gone.
    expect(src).not.toMatch(/'already_claimed'/);
  });

  test('backend still tries to send TON + credits the server-tracked balance', () => {
    const src = fs.readFileSync(ME, 'utf8');
    // The faucet must still actually send TON. After sweep #10 the
    // destination switched from owner wallet → vault, but it MUST still
    // call sendPlainTon to one of the two.
    expect(src).toMatch(/sendPlainTon\(user\.(wallet_address|vault_address),\s*FAUCET_AMOUNT\)/);
    // And still bump a server-tracked balance (either test_usdc_balance
    // for the legacy path or test_usdc_vault_balance for the new path).
    expect(src).toMatch(/test_usdc(?:_vault)?_balance:/);
  });

  test('first claim time is recorded only once (telemetry, not a gate)', () => {
    const src = fs.readFileSync(ME, 'utf8');
    // Idempotent set — only update faucet_claimed_at if it's still null.
    expect(src).toMatch(/if\s*\(\s*!user\.faucet_claimed_at\s*\)[\s\S]{0,200}faucet_claimed_at/);
  });

  test('wallet UI button is no longer gated on faucetClaimed', () => {
    const src = fs.readFileSync(WALLET, 'utf8');
    // The disabled prop must NOT include faucetClaimed in the condition.
    expect(src).not.toMatch(/disabled=\{faucetClaimed/);
    // Should still gate on busy state (no double-clicks while one tx in flight).
    expect(src).toMatch(/disabled=\{busy\s*===\s*['"]faucet['"]/);
  });
});
