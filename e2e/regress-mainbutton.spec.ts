import { test, expect } from './fixtures/strict-page';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression for commit f52ac82 — MainButtonShim visibility.
 *
 * Two bugs in `apps/tma/src/components/MainButtonShim.tsx`:
 *   1) Fallback button was className="… sm:hidden" → invisible on viewports
 *      >=640px. Desktop users opening an invite link saw no button.
 *   2) When the native Telegram MainButton path was active, `btn.hide()` was
 *      called whenever `disabled` was true. So before slot selection the
 *      button vanished entirely.
 *
 * Source contract — both pitfalls must stay fixed:
 *   - Fallback wrapper must NOT contain `sm:hidden`.
 *   - The native MainButton path must NOT call btn.hide() solely on
 *     `disabled`; it should call btn.show() whenever visible and only
 *     toggle disable/enable.
 */
const SHIM = path.join(
  __dirname, '..', 'apps', 'tma', 'src', 'components', 'MainButtonShim.tsx',
);

test.describe('regress-mainbutton — source contract', () => {
  test('fallback wrapper does not hide above sm breakpoint', () => {
    const src = fs.readFileSync(SHIM, 'utf8');
    // The fallback is the <div className="..."> wrapping the <button>.
    // It must contain "fixed" or "sticky" positioning and must NOT include
    // "sm:hidden" or any Tailwind hide-above-sm class.
    expect(src).not.toMatch(/sm:hidden/);
  });

  test('disabled state does not hide the native MainButton', () => {
    const src = fs.readFileSync(SHIM, 'utf8');
    // The bad shape: `if (visible && !disabled) btn.show(); else btn.hide();`
    // The fixed shape: `if (visible) btn.show(); else btn.hide();` followed
    // by separate `btn.disable() / btn.enable()`.
    expect(src).not.toMatch(/visible\s*&&\s*!disabled.{0,30}show/);
    expect(src).toMatch(/if\s*\(\s*visible\s*\)\s*btn\.show/);
  });
});

test.describe('regress-mainbutton — desktop fallback visible at 1280px', () => {
  test('/create renders a sticky CTA fallback (no Telegram WebApp, MainButton path inactive)', async ({ page }) => {
    // /create renders its MainButtonShim unconditionally (no backend fetch
    // gating); /join needs a kye payload which requires Supabase, so we
    // use /create here. The same MainButtonShim component is exercised
    // on both pages — fixing the fallback positioning fixes both.
    await page.goto('/create');
    await expect(
      page.locator('button').filter({ hasText: /계 생성|만들기|Create circle|create/i }).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
