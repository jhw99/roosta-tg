import { test, expect } from './fixtures/strict-page';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression for the "infinite vault pump" bug found 2026-05-19.
 *
 * Symptom: user clicks "Contribute now"; the contract rejects (vault
 * address mismatch / wrong round / not a member) and bounces the message
 * back to the vault. The vault's plain `receive()` accepts the bounced
 * TON as "incoming funding", so vault balance INCREASES instead of
 * decreasing. The button's `disabled={contributing}` only stayed true
 * during the await, then re-enabled — so users tapped repeatedly,
 * pumping vault balance on every failed attempt.
 *
 * Source contract for the fix:
 *   1. After click, `submittedAt` is set and persists until either
 *      myStatus === 'paid' OR a 90s watchdog timeout fires.
 *   2. Button disabled also gates on `submittedAt != null`.
 *   3. If watchdog fires and the vault balance did NOT decrease, the
 *      user sees `contributeStuck` warning instead of a silent re-enable.
 *   4. Button label is unambiguous about direction ("Pay 100 USDC" /
 *      "100 USDC 납입하기").
 */
const KYE_PAGE = path.join(
  __dirname, '..', 'apps', 'tma', 'src', 'app', 'kye', '[address]', 'page.tsx',
);
const KO_I18N = path.join(__dirname, '..', 'apps', 'tma', 'src', 'i18n', 'ko.ts');
const EN_I18N = path.join(__dirname, '..', 'apps', 'tma', 'src', 'i18n', 'en.ts');

test.describe('regress-contribute-lock — source contract', () => {
  test('submittedAt state exists and gates the button', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    expect(src).toMatch(/setSubmittedAt\(Date\.now\(\)\)/);
    // The disabled check must include BOTH `contributing` AND `submittedAt`.
    expect(src).toMatch(/disabled=\{contributing\s*\|\|\s*submittedAt\s*!=\s*null\}/);
  });

  test('watchdog releases lock and surfaces contributeStuck when no balance drop', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    // 90_000 ms = 90s timeout fallback so the user is not locked forever.
    expect(src).toMatch(/90_?000/);
    expect(src).toMatch(/contributeStuck/);
    expect(src).toMatch(/balanceNow\s*<\s*balanceBefore/);
  });

  test('myStatus===paid clears the lock immediately', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    expect(src).toMatch(/myStatus\s*===\s*['"]paid['"][\s\S]{0,80}setSubmittedAt\(null\)/);
  });

  test('button label is unambiguous about payment direction', () => {
    const ko = fs.readFileSync(KO_I18N, 'utf8');
    const en = fs.readFileSync(EN_I18N, 'utf8');
    // Korean: must mention "납입" (deposit/pay-in), not the generic "지금 납입" alone.
    expect(ko).toMatch(/contributeNow:[^,]*USDC 납입/);
    // English: must say "Pay" not just "Contribute".
    expect(en).toMatch(/contributeNow:[^,]*Pay\s+\d+\s+USDC/);
  });
});
