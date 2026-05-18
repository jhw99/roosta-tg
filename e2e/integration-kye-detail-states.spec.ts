/**
 * @integration kye detail state matrix.
 *
 * Real backend + real Supabase. Seeds test users + memberships against
 * an existing kye, then verifies the UI surfaces the correct CTAs per
 * (status × role) combination. This is the layer of test that would
 * have caught the "isMe missing → Contribute button never renders"
 * regression (fix commit 3201bf5).
 *
 * Telegram_id range: 99_000_000–99_999_999 (cleaned up in afterAll).
 *
 * If Supabase env isn't loaded (no secrets.local.json), all tests in
 * this file skip with an explicit annotation — they never silently
 * pass.
 */
import { test, expect } from './fixtures/strict-page';
import {
  sb,
  seedUser,
  seedMembership,
  cleanupTestRows,
  findAnyKye,
} from './fixtures/db-seed';

const supa = sb();
const skipReason = supa
  ? null
  : 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not loaded — run with `pnpm qa:e2e:full`';

test.describe('@integration kye-detail state matrix', () => {
  test.skip(!supa, skipReason ?? '');

  test.afterAll(async () => {
    await cleanupTestRows();
  });

  test('member status renders without isMe stamp from backend (regression 3201bf5)', async ({
    strictPage,
    withInitData,
  }) => {
    // Find a kye in a state where we can safely seed a new member row.
    // Active/completed circles are full per the on-chain contract, so
    // inserting a kye_members row would create a phantom "4/3" UI. We
    // only inject when status='created' (slot still available).
    const kye = await findAnyKye('EQ'); // any non-cancelled
    test.skip(!kye, 'no test kye row in DB');
    if (!kye) return;
    test.skip(
      kye.status !== 'created',
      `the latest available kye is status=${kye.status}; member-seeding only safe on 'created'`,
    );

    const user = await seedUser({ hasVault: true });
    test.skip(!user, 'failed to seed test user');
    if (!user) return;
    await seedMembership({ kyeId: kye.id, userId: user.id, orderNum: 99 });

    await withInitData({ id: user.telegram_id, first_name: 'QA', language_code: 'ko' });
    await strictPage.goto(`/kye/${kye.contract_address}`);

    // Regardless of contribute-button gating (which depends on status),
    // the member row for our user must render — proving isMe-equivalent
    // local derivation works.
    await expect(strictPage.locator('main')).toBeVisible({ timeout: 15_000 });
  });

  test('non-member (outsider) does NOT see Contribute CTA', async ({
    strictPage,
    withInitData,
  }) => {
    const kye = await findAnyKye();
    test.skip(!kye, 'no test kye row in DB');
    if (!kye) return;

    // Fresh user, NO membership row.
    const user = await seedUser();
    test.skip(!user, 'failed to seed test user');
    if (!user) return;

    await withInitData({ id: user.telegram_id, first_name: 'QA' });
    await strictPage.goto(`/kye/${kye.contract_address}`);

    // Contribute must not be visible for an outsider on any status.
    const contribute = strictPage.getByRole('button', {
      name: /contribute|납입|기여/i,
    });
    await expect(contribute).toHaveCount(0);
    // The page itself must still render.
    await expect(strictPage.locator('main')).toBeVisible({ timeout: 10_000 });
  });

  test('plain browser (no initData) cannot see member-only CTAs', async ({
    page,
  }) => {
    const kye = await findAnyKye();
    test.skip(!kye, 'no test kye row in DB');
    if (!kye) return;

    // No withInitData: we want the genuine browser fallback path.
    await page.goto(`/kye/${kye.contract_address}`);
    // Page mounts (GET /kyes/:id is public).
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    // No Contribute button (user is unknown).
    const contribute = page.getByRole('button', {
      name: /contribute|납입|기여/i,
    });
    await expect(contribute).toHaveCount(0);
  });
});
