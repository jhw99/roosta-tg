import { test, expect } from './fixtures/strict-page';

/**
 * Baseline smoke — every route renders without console errors or 5xx.
 */
test.describe('home-renders — baseline', () => {
  test('/ mounts', async ({ strictPage, withInitData }) => {
    await withInitData();
    await strictPage.goto('/');
    await expect(strictPage.locator('body')).not.toBeEmpty();
  });

  test('/wallet mounts', async ({ strictPage, withInitData }) => {
    await withInitData();
    await strictPage.goto('/wallet');
    await expect(strictPage.locator('body')).not.toBeEmpty();
  });

  test('/create mounts', async ({ strictPage, withInitData }) => {
    await withInitData();
    await strictPage.goto('/create');
    await expect(strictPage.locator('body')).not.toBeEmpty();
  });
});
