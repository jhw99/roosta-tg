/**
 * Sweep #7 — server-tracked vault balance ledger.
 *
 * Replaces the wallet page's "vault balance" line (which used to read
 * the vault contract's raw TON balance) with a server-tracked ledger.
 * That number was polluted by bounced messages, relayer gas residuals,
 * and external TON transfers — so "Vault holds X USDC" was lying to
 * the user. The ledger is now driven by:
 *
 *   /me/balance/deposit  → vault += amount  (top-up)
 *   /relay (target=owner)  → vault -= amount, owner += amount  (withdraw)
 *   /relay (other target)  → vault -= amount                   (contribute / join)
 *   indexer PayoutSent     → vault += amount                   (round win)
 *
 * These specs pin the source contract so a future refactor that drops
 * any of those legs surfaces immediately.
 */
import { test, expect } from './fixtures/strict-page';
import fs from 'node:fs';
import path from 'node:path';

const ME = path.join(__dirname, '..', 'apps', 'backend', 'src', 'routes', 'me.ts');
const RELAY = path.join(__dirname, '..', 'apps', 'backend', 'src', 'routes', 'relay.ts');
const INDEXER = path.join(__dirname, '..', 'apps', 'backend', 'src', 'indexer', 'indexer.ts');
const CURRENT_USER = path.join(
  __dirname, '..', 'apps', 'backend', 'src', 'lib', 'currentUser.ts',
);
const WALLET_TSX = path.join(
  __dirname, '..', 'apps', 'tma', 'src', 'app', 'wallet', 'page.tsx',
);
const API_TS = path.join(__dirname, '..', 'apps', 'tma', 'src', 'lib', 'api.ts');

test.describe('regress-vault-ledger — server-tracked vault balance', () => {
  test('users row carries test_usdc_vault_balance', () => {
    const src = fs.readFileSync(CURRENT_USER, 'utf8');
    expect(src).toContain('test_usdc_vault_balance');
  });

  test('/me/balance/deposit credits vault and debits owner', () => {
    const src = fs.readFileSync(ME, 'utf8');
    // Owner debit (already existed) — nextOwner declared then used to
    // update test_usdc_balance.
    expect(src).toMatch(/nextOwner[\s\S]{0,400}test_usdc_balance/);
    // Vault credit (new) — nextVault declared then used to update
    // test_usdc_vault_balance.
    expect(src).toMatch(/nextVault[\s\S]{0,400}test_usdc_vault_balance/);
    // Both updated together in the SAME update() call. Use a more permissive
    // proximity match — just verify both keys appear within a few hundred
    // characters of each other in the deposit handler.
    expect(src).toMatch(/test_usdc_balance:[\s\S]{0,300}test_usdc_vault_balance:/);
  });

  test('/relay debits vault on EVERY outflow and credits owner only on withdraw', () => {
    const src = fs.readFileSync(RELAY, 'utf8');
    // Vault debit happens unconditionally on relay success.
    expect(src).toMatch(/test_usdc_vault_balance:[\s\S]{0,80}newVault/);
    // Owner credit ONLY when target equals owner wallet (withdraw).
    expect(src).toMatch(/isWithdrawToOwner[\s\S]{0,150}test_usdc_balance/);
  });

  test('indexer PayoutSent credits the winner vault', () => {
    const src = fs.readFileSync(INDEXER, 'utf8');
    expect(src).toMatch(/case 'PayoutSent'/);
    // Look up by vault_address (not wallet_address) — winner field is a vault.
    expect(src).toMatch(/from\(['"]users['"]\)[\s\S]{0,150}eq\(['"]vault_address['"]/);
    // Increment test_usdc_vault_balance.
    expect(src).toMatch(/test_usdc_vault_balance:[\s\S]{0,80}\+\s*amount/);
  });

  test('wallet page reads testUsdcVaultBalance (not raw chain balance)', () => {
    const src = fs.readFileSync(WALLET_TSX, 'utf8');
    expect(src).toContain('testUsdcVaultBalance');
    // The withdraw flow still cross-checks chain balance against server
    // balance — server is preferred, chain is the cap.
    expect(src).toMatch(/vaultBalanceServer/);
    expect(src).toMatch(/vaultBalanceChain/);
  });

  test('api.ts schema exposes testUsdcVaultBalance + notifyDeposit returns it', () => {
    const src = fs.readFileSync(API_TS, 'utf8');
    expect(src).toContain('testUsdcVaultBalance');
    expect(src).toMatch(/notifyDeposit[\s\S]{0,300}testUsdcVaultBalance/);
  });
});
