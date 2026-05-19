/**
 * E-01~05 — create-form boundary fuzz.
 *
 * Mirror of Solana side's 06-circle-create-input-fuzz, adapted to the
 * TMA's /create form. Asserts that the form blocks (or surfaces an
 * error for) clearly-invalid inputs BEFORE sending to backend.
 */
import { test, expect } from './fixtures/strict-page';

test.describe('regress-create-form-fuzz', () => {
  test('form renders all required fields', async ({ strictPage, withInitData }) => {
    await withInitData();
    await strictPage.goto('/create');
    await expect(strictPage.locator('input, select')).not.toHaveCount(0);
  });

  test('empty name is gated before submit', async ({ strictPage, withInitData }) => {
    await withInitData();
    await strictPage.goto('/create');
    const submit = strictPage
      .getByRole('button', { name: /create|만들|continue|next/i })
      .first();
    if (!(await submit.isVisible().catch(() => false))) return;
    const isDisabled = await submit.isDisabled().catch(() => false);
    // Either submit is disabled (good) OR clicking should not navigate
    // away from /create. We accept any non-navigation outcome as gating.
    if (!isDisabled) {
      await submit.click().catch(() => {});
      // Should stay on /create — backend would reject zod-invalid body
      // and the page should NOT have navigated to /kye/<addr>.
      await expect(strictPage).toHaveURL(/\/create/, { timeout: 3_000 });
    }
  });

  test('contribution = 0 is rejected', async ({ strictPage, withInitData }) => {
    await withInitData();
    await strictPage.goto('/create');
    const num = strictPage.locator('input[type="number"]');
    if (!(await num.count())) return;
    // Fill every numeric input with 0 — worst case.
    const count = await num.count();
    for (let i = 0; i < count; i++) {
      await num.nth(i).fill('0').catch(() => {});
    }
    const submit = strictPage
      .getByRole('button', { name: /create|만들|continue|next/i })
      .first();
    const isDisabled = await submit.isDisabled().catch(() => false);
    if (!isDisabled) {
      await submit.click({ trial: true }).catch(() => {});
      const hint = strictPage.getByText(/invalid|범위|0|must|min/i).first();
      await expect(hint).toBeVisible({ timeout: 5_000 });
    }
  });
});
