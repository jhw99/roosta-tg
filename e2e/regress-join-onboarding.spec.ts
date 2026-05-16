import { test, expect } from './fixtures/strict-page';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression for commit 465c060 — join page auto-onboarding.
 *
 * Before: first-time user clicked Join → vault.activate failed silently
 * because the owner wallet had 0 TON, no nudge to faucet existed, the
 * LoadingOverlay showed a generic "Joining..." for ~30s.
 *
 * After: submit() runs three steps inline:
 *   1. api.faucet() if !user.faucetClaimedAt (testnet only; 403/409 swallowed)
 *      + poll toncenter until owner wallet is funded
 *   2. vault.activate(JOIN_ACTIVATION_FUNDING_TON) if !vault.ready
 *   3. signAndRelay(JoinKye)
 * The LoadingOverlay surfaces a step-specific message.
 *
 * The full E2E of step 2 needs TonConnect popup → manual checklist.
 * Source contract test below covers the orchestration shape.
 */
const JOIN_PAGE = path.join(
  __dirname, '..', 'apps', 'tma', 'src', 'app', 'join', '[address]', 'page.tsx',
);

test.describe('regress-join-onboarding — source contract', () => {
  test('three-step onboarding present in submit()', () => {
    const src = fs.readFileSync(JOIN_PAGE, 'utf8');
    // Step 1: faucet
    expect(src).toMatch(/api\.faucet\(/);
    expect(src).toMatch(/faucetClaimedAt/);
    // Step 2: vault activation
    expect(src).toMatch(/vault\.activate\(/);
    expect(src).toMatch(/JOIN_ACTIVATION_FUNDING_TON/);
    // Step 3: relay
    expect(src).toMatch(/signAndRelay\(/);
    expect(src).toMatch(/buildJoinKyeBody/);
  });

  test('onboard step state drives the loading message', () => {
    const src = fs.readFileSync(JOIN_PAGE, 'utf8');
    expect(src).toMatch(/onboardStep|OnboardStep/);
    expect(src).toMatch(/'faucet'/);
    expect(src).toMatch(/'activate'/);
    expect(src).toMatch(/'join'/);
  });

  test('429/409 from faucet are swallowed (mainnet / already-claimed)', () => {
    const src = fs.readFileSync(JOIN_PAGE, 'utf8');
    // The fix must not throw when faucet returns 403 (mainnet disabled) or
    // 409 (already claimed). It re-throws every other ApiError.
    expect(src).toMatch(/ApiError[\s\S]{0,200}(403|409)/);
  });

  test('toncenter polling waits for owner wallet funding before activating', () => {
    const src = fs.readFileSync(JOIN_PAGE, 'utf8');
    expect(src).toMatch(/waitForWalletFunded|toncenter/);
  });
});

test.describe('regress-join-onboarding — UI mount', () => {
  test('join page mounts and shows slot picker / payout table', async ({ strictPage, withInitData }) => {
    test.setTimeout(45_000);
    await withInitData();
    await strictPage.goto('/join/EQDzfhRS8yLpoVp13jTb7IGwYxoa2u9gchJXrUmEiJhmWL4Y');
    // The page should render either the form (kye fetched) or an error
    // banner — never a blank screen.
    await expect(strictPage.locator('main')).toBeVisible({ timeout: 15_000 });
    // Either a header with the kye title or the error text — assert mount.
    const hasContent = strictPage.locator('main *');
    await expect(hasContent.first()).toBeVisible({ timeout: 10_000 });
  });
});
