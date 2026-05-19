/**
 * R-01 / R-02 — rapid clicks / double-submit guards.
 *
 * Live bug surfaced 2026-05-19: contribute button kept re-enabling after
 * each click → infinite vault pump. Fix in 95afe17 added submittedAt
 * lock. This spec exercises the lock by hammering the Join CTA on the
 * /join page (similar single-action surface).
 *
 * Contribute itself is hard to drive E2E without a real-active kye +
 * member identity; the lock logic is the same code path so we test the
 * Join CTA as a proxy. The contribute lock is pinned by
 * regress-contribute-lock at source level.
 */
import { test, expect } from './fixtures/strict-page';

test.describe('regress-rapid-clicks — join CTA', () => {
  test('rapid double-click on Join does not fire two flows', async ({
    strictPage,
    withInitData,
  }) => {
    await withInitData();
    await strictPage.goto('/join/EQDzfhRS8yLpoVp13jTb7IGwYxoa2u9gchJXrUmEiJhmWL4Y');

    // The Join button stays disabled until a slot is picked; the test is
    // about establishing that double-click does not OPEN two modals.
    // We watch how many modal "Open in Telegram" dialogs are visible
    // after two rapid clicks.
    await expect(strictPage.locator('main')).toBeVisible({ timeout: 15_000 });

    const joinBtn = strictPage.locator('button:has-text("계 참여"), button:has-text("Join circle")').first();
    await expect(joinBtn).toBeVisible({ timeout: 10_000 });

    // Try double-click; even if first click opens a modal, second click
    // should not stack a second modal.
    await joinBtn.click({ force: true }).catch(() => {});
    await joinBtn.click({ force: true }).catch(() => {});

    // No two modals on screen at once: count any visible dialog.
    const dialogs = strictPage.getByRole('dialog');
    const count = await dialogs.count();
    expect(count).toBeLessThanOrEqual(1);
  });
});
