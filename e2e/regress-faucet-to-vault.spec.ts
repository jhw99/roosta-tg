/**
 * Sweep #10 — faucet drops 1000 USDC directly to the vault, and the
 * wallet page surfaces ONLY the vault balance (owner balance hidden
 * unless the user opens the Deposit sheet).
 *
 * User direction (2026-05-19):
 *   "1000 USDC는 프록시 지갑에 들어가야하고 이 지갑에서 보이는 정보는
 *    프록시 지갑의 Balance만 표기하도록 변경해줘. Deposit 할 때만
 *    연결되어있는 wallet(Tonkeeper 등)의 balance를 표기해주고."
 */
import { test, expect } from './fixtures/strict-page';
import fs from 'node:fs';
import path from 'node:path';

const ME = path.join(__dirname, '..', 'apps', 'backend', 'src', 'routes', 'me.ts');
const WALLET = path.join(
  __dirname, '..', 'apps', 'tma', 'src', 'app', 'wallet', 'page.tsx',
);

test.describe('regress-faucet-to-vault — backend', () => {
  test('faucet sends to vault_address, not wallet_address', () => {
    const src = fs.readFileSync(ME, 'utf8');
    expect(src).toMatch(/sendPlainTon\(user\.vault_address,\s*FAUCET_AMOUNT\)/);
    // The old "send to wallet_address" path is gone.
    expect(src).not.toMatch(/sendPlainTon\(user\.wallet_address/);
  });

  test('faucet requires vault_address before sending', () => {
    const src = fs.readFileSync(ME, 'utf8');
    expect(src).toMatch(/!user\.vault_address[\s\S]{0,200}no_vault/);
  });

  test('faucet credits test_usdc_vault_balance (not owner balance)', () => {
    const src = fs.readFileSync(ME, 'utf8');
    // Faucet handler must increment test_usdc_vault_balance.
    expect(src).toMatch(/test_usdc_vault_balance:\s*newVaultBalance/);
    // And must NOT also increment test_usdc_balance in the faucet path
    // — owner balance is for off-ramp only now.
    const faucetBlock = src.slice(
      src.indexOf("me.post('/faucet'"),
      src.indexOf("me.post('/balance/deposit'"),
    );
    expect(faucetBlock).not.toMatch(/test_usdc_balance:\s*newBalance/);
  });
});

test.describe('regress-faucet-to-vault — wallet UI', () => {
  test('wallet page no longer shows owner balance line', () => {
    const src = fs.readFileSync(WALLET, 'utf8');
    // The old "{s.wallet.balance}:  {nanoToUsdc(ownerBalance)} USDC" line
    // must be gone from the main wallet card (still present in the
    // Deposit dialog as `availableInWallet`).
    const mainCard = src.split('Owner wallet')[1]?.split('Vault summary')[0] ?? '';
    expect(mainCard).not.toMatch(/s\.wallet\.balance/);
    expect(mainCard).not.toMatch(/nanoToUsdc\(ownerBalance\)/);
  });

  test('Deposit sheet still shows owner balance as "available in wallet"', () => {
    const src = fs.readFileSync(WALLET, 'utf8');
    // The deposit dialog must show the source balance so users know
    // how much they can move into the vault.
    expect(src).toMatch(/availableInWallet[\s\S]{0,200}nanoToUsdc\(ownerBalance\)/);
  });
});
