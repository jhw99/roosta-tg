import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabase } from '../lib/supabase.js';
import { extractTelegramUser, resolveOrCreateUser } from '../lib/currentUser.js';
import { fail } from '../lib/errors.js';

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
    },
    kyes,
  });
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
