/**
 * DB seed helpers for Playwright integration specs.
 *
 * Uses the same Supabase service-role client the backend uses, so test rows
 * land in the SAME database the backend serves. To avoid colliding with real
 * users, every test telegram_id sits in [99_000_000, 99_999_999] and tests
 * clean up their own rows in afterAll.
 *
 * REQUIRES env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (loaded by
 * scripts/qa-with-secrets.mjs from secrets.local.json).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _sb: SupabaseClient | null = null;
export function sb(): SupabaseClient | null {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

export const TEST_TG_RANGE_MIN = 99_000_000;
export const TEST_TG_RANGE_MAX = 99_999_999;

export function genTestTgId(): number {
  return TEST_TG_RANGE_MIN + Math.floor(Math.random() * (TEST_TG_RANGE_MAX - TEST_TG_RANGE_MIN));
}

export interface SeededUser {
  id: string;
  telegram_id: number;
  wallet_address: string;
  vault_address: string;
}

/** Create a test user row with realistic wallet + vault stubs. */
export async function seedUser(opts?: { hasVault?: boolean }): Promise<SeededUser | null> {
  const supa = sb();
  if (!supa) return null;
  const telegram_id = genTestTgId();
  const wallet_address = `0Q${'qa'.padEnd(46, telegram_id.toString(36))}A`.slice(0, 48);
  const vault_address = `EQ${'qa'.padEnd(46, telegram_id.toString(36))}V`.slice(0, 48);
  const { data, error } = await supa
    .from('users')
    .insert({
      telegram_id,
      wallet_address,
      vault_address: opts?.hasVault === false ? null : vault_address,
      language: 'ko',
    })
    .select('id, telegram_id, wallet_address, vault_address')
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    telegram_id: Number(data.telegram_id),
    wallet_address: data.wallet_address as string,
    vault_address: (data.vault_address as string) ?? vault_address,
  };
}

/** Add a member row to an existing kye. */
export async function seedMembership(opts: {
  kyeId: string;
  userId: string;
  orderNum: number;
}): Promise<void> {
  const supa = sb();
  if (!supa) return;
  await supa.from('kye_members').insert({
    kye_id: opts.kyeId,
    user_id: opts.userId,
    order_num: opts.orderNum,
    status: 'active',
  });
}

/** Best-effort cleanup of all test telegram_ids' rows. Safe to call in
 *  afterAll even if some rows don't exist. */
export async function cleanupTestRows(): Promise<void> {
  const supa = sb();
  if (!supa) return;
  // Delete dependent rows first to satisfy any FK constraints.
  const { data: testUsers } = await supa
    .from('users')
    .select('id')
    .gte('telegram_id', TEST_TG_RANGE_MIN)
    .lte('telegram_id', TEST_TG_RANGE_MAX);
  const ids = (testUsers ?? []).map((u) => u.id as string);
  if (ids.length > 0) {
    await supa.from('kye_members').delete().in('user_id', ids);
    await supa.from('notification_settings').delete().in('user_id', ids);
    await supa.from('users').delete().in('id', ids);
  }
}

/** Find an existing kye (does NOT create — uses real test data already in DB).
 *  Returns the first non-cancelled circle whose contract address starts with
 *  the optional prefix, or any non-cancelled circle otherwise. */
export async function findAnyKye(prefix?: string): Promise<{ id: string; contract_address: string; status: string } | null> {
  const supa = sb();
  if (!supa) return null;
  let q = supa
    .from('kyes')
    .select('id, contract_address, status')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(50);
  const { data } = await q;
  if (!data) return null;
  const filtered = prefix
    ? data.filter((k) => (k.contract_address as string).startsWith(prefix))
    : data;
  const pick = filtered[0] ?? data[0];
  return pick
    ? {
        id: pick.id as string,
        contract_address: pick.contract_address as string,
        status: pick.status as string,
      }
    : null;
}
