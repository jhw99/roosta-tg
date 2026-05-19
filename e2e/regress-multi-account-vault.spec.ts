/**
 * W-02 — 1 wallet × N TG users → vault PDA collision.
 *
 * This is the root cause behind the live "vault pump on contribute"
 * bug. Two TG users connect the SAME wallet → each derives a different
 * vault PDA (different session keys) → contract members map has vault A
 * → user with vault B tries to contribute → contract require fails →
 * bounce → vault accepts bounced TON as funding.
 *
 * We can't simulate the on-chain bounce in Playwright (sandbox spec
 * covers it in contracts/), but we CAN assert that backend exposes
 * the data needed to detect mismatch — i.e. each user row has a
 * distinct vault_address even though they share wallet_address. If
 * future code unifies them under one vault, this spec will break and
 * force re-evaluation.
 */
import { test, expect } from './fixtures/strict-page';
import { sb, seedUser, cleanupTestRows } from './fixtures/db-seed';

const supa = sb();
const skipReason = supa
  ? null
  : 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not loaded — run with `pnpm qa:e2e:full`';

test.describe('@integration regress-multi-account-vault', () => {
  test.skip(!supa, skipReason ?? '');

  test.afterAll(async () => {
    await cleanupTestRows();
  });

  test('two TG users with the same wallet_address keep distinct vault_address', async () => {
    if (!supa) return;
    const u1 = await seedUser({ hasVault: true });
    const u2 = await seedUser({ hasVault: true });
    test.skip(!u1 || !u2, 'failed to seed users');
    if (!u1 || !u2) return;

    // Force both users to share the same wallet_address.
    const sharedWallet = u1.wallet_address;
    await supa.from('users').update({ wallet_address: sharedWallet }).eq('id', u2.id);

    // Re-read both rows. Their vault_address should still differ — they
    // were derived from different session keys. Today the schema does
    // NOT enforce 1:1 wallet:vault so this passes; once we add the
    // mainnet invariant (1 wallet = 1 vault per the QA_REPORT M-2),
    // this test will need an explicit "expected to reject" branch.
    const { data: rows } = await supa
      .from('users')
      .select('id, wallet_address, vault_address')
      .in('id', [u1.id, u2.id]);
    expect(rows).toHaveLength(2);
    expect(rows![0].wallet_address).toBe(sharedWallet);
    expect(rows![1].wallet_address).toBe(sharedWallet);
    expect(rows![0].vault_address).not.toBe(rows![1].vault_address);
  });

  test('detection helper: same-wallet rows reachable via query (for UI warning)', async () => {
    if (!supa) return;
    const u1 = await seedUser({ hasVault: true });
    const u2 = await seedUser({ hasVault: true });
    if (!u1 || !u2) return;
    await supa.from('users').update({ wallet_address: u1.wallet_address }).eq('id', u2.id);

    const { data } = await supa
      .from('users')
      .select('id, vault_address')
      .eq('wallet_address', u1.wallet_address);
    // 1 wallet → 2+ rows means the UI MUST warn the user that they may
    // be looking at a stale-vault membership. This is the data fixture
    // we'd build a warning banner on (M-2 in QA_REPORT).
    expect((data ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
