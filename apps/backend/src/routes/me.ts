import { Hono } from 'hono';
import { z } from 'zod';
import { Address } from '@ton/core';
import { getSupabase } from '../lib/supabase.js';
import { extractTelegramUser, resolveOrCreateUser } from '../lib/currentUser.js';
import { fail } from '../lib/errors.js';
import { predictVaultAddress } from '../lib/vault.js';

export const me = new Hono();

me.get('/', async (c) => {
  const sb = getSupabase();
  if (!sb) return fail(c, 500, 'no_db', 'Database not configured');
  const tg = extractTelegramUser(c);
  if (!tg) return fail(c, 401, 'no_user', 'No Telegram user in initData');
  const user = await resolveOrCreateUser(sb, tg);
  if (!user) return fail(c, 500, 'user_upsert', 'Could not create user row');

  const { data: memberships } = await sb
    .from('kye_members')
    .select('kye_id, order_num, status, kyes(id, name, contract_address, status)')
    .eq('user_id', user.id);

  const kyes = (memberships ?? []).map((m) => {
    const mm = m as unknown as { kyes?: Record<string, unknown> | Record<string, unknown>[] };
    const k = (Array.isArray(mm.kyes) ? mm.kyes[0] : mm.kyes) ?? {};
    return {
      kyeId: k.id,
      name: k.name,
      contractAddress: k.contract_address,
      status: k.status,
      orderNum: (m as { order_num?: number }).order_num ?? null,
      memberStatus: (m as { status?: string }).status ?? null,
    };
  });

  return c.json({
    user: {
      id: user.id,
      telegramId: user.telegram_id,
      walletAddress: user.wallet_address,
      language: user.language,
      vaultAddress: user.vault_address,
      sessionPubkey: user.session_pubkey,
    },
    kyes,
  });
});

// Register the user's gasless proxy vault. The TMA computes the deterministic
// vault address client-side; the backend recomputes it from (walletAddress,
// sessionPubkey) and rejects a mismatch so a user cannot register someone
// else's vault. See docs/GASLESS_ARCHITECTURE.md.
const VaultBody = z.object({
  sessionPubkey: z.string().regex(/^[0-9a-fA-F]{64}$/),
  vaultAddress: z.string().min(10).max(100),
});

me.patch('/vault', async (c) => {
  const sb = getSupabase();
  if (!sb) return fail(c, 500, 'no_db', 'Database not configured');
  const tg = extractTelegramUser(c);
  if (!tg) return fail(c, 401, 'no_user', 'No Telegram user in initData');

  const body = await c.req.json().catch(() => null);
  const parsed = VaultBody.safeParse(body);
  if (!parsed.success) return fail(c, 400, 'invalid_body', parsed.error.message);

  const user = await resolveOrCreateUser(sb, tg);
  if (!user) return fail(c, 500, 'user_upsert', 'Could not create user row');
  if (!user.wallet_address) {
    return fail(c, 409, 'no_wallet', 'Connect a TON wallet before registering a vault');
  }

  // Recompute the deterministic address and reject a mismatch.
  let expected: Address;
  try {
    expected = await predictVaultAddress(
      Address.parse(user.wallet_address),
      BigInt('0x' + parsed.data.sessionPubkey),
    );
  } catch (e) {
    return fail(c, 400, 'invalid_encoding', (e as Error).message);
  }
  let claimed: Address;
  try {
    claimed = Address.parse(parsed.data.vaultAddress);
  } catch (e) {
    return fail(c, 400, 'invalid_encoding', (e as Error).message);
  }
  if (!expected.equals(claimed)) {
    return fail(
      c,
      400,
      'vault_mismatch',
      'vaultAddress is not the deterministic address for this wallet + session key',
    );
  }

  const { error } = await sb
    .from('users')
    .update({
      vault_address: expected.toString(),
      session_pubkey: parsed.data.sessionPubkey,
    })
    .eq('id', user.id);
  if (error) return fail(c, 500, 'db_error', error.message);

  return c.json({ ok: true, vaultAddress: expected.toString() });
});

const WalletBody = z.object({
  walletAddress: z.string().min(10).max(100),
});

me.patch('/wallet', async (c) => {
  const sb = getSupabase();
  if (!sb) return fail(c, 500, 'no_db', 'Database not configured');
  const tg = extractTelegramUser(c);
  if (!tg) return fail(c, 401, 'no_user', 'No Telegram user in initData');

  const body = await c.req.json().catch(() => null);
  const parsed = WalletBody.safeParse(body);
  if (!parsed.success) return fail(c, 400, 'invalid_body', parsed.error.message);

  const user = await resolveOrCreateUser(sb, tg);
  if (!user) return fail(c, 500, 'user_upsert', 'Could not create user row');

  const { error } = await sb
    .from('users')
    .update({ wallet_address: parsed.data.walletAddress })
    .eq('id', user.id);
  if (error) return fail(c, 500, 'db_error', error.message);

  return c.json({ ok: true, walletAddress: parsed.data.walletAddress });
});

const NotificationSettingsBody = z.object({
  settings: z.record(z.string(), z.boolean()),
});

me.patch('/notification-settings', async (c) => {
  const sb = getSupabase();
  if (!sb) return fail(c, 500, 'no_db', 'Database not configured');
  const tg = extractTelegramUser(c);
  if (!tg) return fail(c, 401, 'no_user', 'No Telegram user in initData');

  const body = await c.req.json().catch(() => null);
  const parsed = NotificationSettingsBody.safeParse(body);
  if (!parsed.success) return fail(c, 400, 'invalid_body', parsed.error.message);

  const user = await resolveOrCreateUser(sb, tg);
  if (!user) return fail(c, 500, 'user_upsert', 'Could not create user row');

  const rows = Object.entries(parsed.data.settings).map(([key, value]) => ({
    user_id: user.id,
    key,
    value,
  }));
  if (rows.length > 0) {
    const { error } = await sb
      .from('notification_settings')
      .upsert(rows, { onConflict: 'user_id,key' });
    if (error) return fail(c, 500, 'db_error', error.message);
  }
  return c.json({ ok: true, updated: rows.length });
});
