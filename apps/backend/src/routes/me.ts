import { Hono } from 'hono';
import { z } from 'zod';
import { Address, toNano } from '@ton/core';
import { getSupabase } from '../lib/supabase.js';
import { extractTelegramUser, resolveOrCreateUser } from '../lib/currentUser.js';
import { fail } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { predictVaultAddress } from '../lib/vault.js';
import { sendPlainTon } from '../scheduler/walletService.js';

export const me = new Hono();

const POLICY_FROM_INT: Record<number, 'pro_rata' | 'cancel' | 'organizer_cover'> = {
  0: 'pro_rata',
  1: 'cancel',
  2: 'organizer_cover',
};

me.get('/', async (c) => {
  const sb = getSupabase();
  if (!sb) return fail(c, 500, 'no_db', 'Database not configured');
  const tg = extractTelegramUser(c);
  if (!tg) return fail(c, 401, 'no_user', 'No Telegram user in initData');
  const user = await resolveOrCreateUser(sb, tg);
  if (!user) return fail(c, 500, 'user_upsert', 'Could not create user row');

  // The user appears in "My Circles" if they (a) hold a member slot OR (b)
  // organize the circle. Organizers never take a slot — KyeContract forbids
  // it — so they would otherwise see an empty list right after creation.
  const KYE_COLS =
    'id, name, contract_address, organizer_id, params, status, created_at';
  const [{ data: memberships }, { data: organized }] = await Promise.all([
    sb
      .from('kye_members')
      .select(`kye_id, order_num, status, kyes(${KYE_COLS})`)
      .eq('user_id', user.id),
    sb.from('kyes').select(KYE_COLS).eq('organizer_id', user.id),
  ]);

  // Pull next-unexecuted round timestamps in one shot.
  const allKyeIds = new Set<string>();
  for (const m of memberships ?? []) {
    const mm = m as unknown as { kyes?: Record<string, unknown> | Record<string, unknown>[] };
    const k = (Array.isArray(mm.kyes) ? mm.kyes[0] : mm.kyes) ?? {};
    if (k.id) allKyeIds.add(k.id as string);
  }
  for (const k of organized ?? []) {
    if (k.id) allKyeIds.add(k.id as string);
  }
  const nextRoundByKye = new Map<string, { roundNum: number; scheduledAt: number | null }>();
  if (allKyeIds.size > 0) {
    const { data: rounds } = await sb
      .from('rounds')
      .select('kye_id, round_num, scheduled_at, executed_at')
      .in('kye_id', Array.from(allKyeIds))
      .is('executed_at', null);
    for (const r of rounds ?? []) {
      const id = r.kye_id as string;
      const existing = nextRoundByKye.get(id);
      const n = Number(r.round_num);
      if (!existing || n < existing.roundNum) {
        nextRoundByKye.set(id, {
          roundNum: n,
          scheduledAt: r.scheduled_at
            ? Math.floor(new Date(r.scheduled_at as string).getTime() / 1000)
            : null,
        });
      }
    }
  }

  const toWireKye = (
    raw: Record<string, unknown>,
    role: 'organizer' | 'member',
    extra: { orderNum: number | null; memberStatus: string | null },
  ) => {
    const p = (raw.params ?? {}) as Record<string, unknown>;
    const memberCount = Number(p.memberCount ?? 0);
    const defaultPolicy =
      typeof p.defaultPolicy === 'number'
        ? POLICY_FROM_INT[p.defaultPolicy] ?? 'pro_rata'
        : ((p.defaultPolicy as string) ?? 'pro_rata');
    const next = nextRoundByKye.get(raw.id as string) ?? null;
    return {
      id: raw.id as string,
      kyeId: raw.id as string,
      name: (raw.name as string) ?? '',
      contractAddress: (raw.contract_address as string) ?? '',
      organizerId: (raw.organizer_id as string) ?? '',
      status: (raw.status as string) ?? '',
      memberCount,
      currentRound: next?.roundNum ?? 1,
      nextRoundAt: next?.scheduledAt ?? null,
      createdAt: raw.created_at
        ? Math.floor(new Date(raw.created_at as string).getTime() / 1000)
        : 0,
      params: {
        N: memberCount,
        contribution: String(p.contribution ?? '0'),
        roundIntervalSec: Number(p.roundIntervalSec ?? 0),
        feeRateBps: Number(p.feeRateBps ?? 0),
        alphaMaxBps: Number(p.alphaMaxBps ?? 0),
        defaultPolicy,
      },
      orderNum: extra.orderNum,
      memberStatus: extra.memberStatus,
      role,
    };
  };

  const byKyeId = new Map<string, ReturnType<typeof toWireKye>>();
  for (const m of memberships ?? []) {
    const mm = m as unknown as { kyes?: Record<string, unknown> | Record<string, unknown>[] };
    const k = (Array.isArray(mm.kyes) ? mm.kyes[0] : mm.kyes) ?? {};
    if (!k.id) continue;
    byKyeId.set(
      k.id as string,
      toWireKye(k, 'member', {
        orderNum: (m as { order_num?: number }).order_num ?? null,
        memberStatus: (m as { status?: string }).status ?? null,
      }),
    );
  }
  for (const k of organized ?? []) {
    if (byKyeId.has(k.id as string)) continue;
    byKyeId.set(
      k.id as string,
      toWireKye(k, 'organizer', { orderNum: null, memberStatus: null }),
    );
  }
  // Hide cancelled circles from "My Circles" — they're effectively deleted.
  // (Members who contributed before cancellation can still claim refunds by
  // visiting the kye contract directly; that lives outside this list view.)
  const kyes = Array.from(byKyeId.values()).filter((k) => k.status !== 'cancelled');

  return c.json({
    user: {
      id: user.id,
      telegramId: user.telegram_id,
      walletAddress: user.wallet_address,
      language: user.language,
      vaultAddress: user.vault_address,
      sessionPubkey: user.session_pubkey,
      faucetClaimedAt: user.faucet_claimed_at,
      testUsdcBalance: user.test_usdc_balance,
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

// Testnet faucet — once per user, sends a 1 TON ("1000 USDC" at the 6-dec
// display scale) drop to the user's connected wallet so they can test the
// deposit/withdraw flow without manually grabbing testnet TON. Mainnet builds
// simply never call this; remove the env flag to disable.
const FAUCET_AMOUNT = toNano('1');

me.post('/faucet', async (c) => {
  if (process.env.TON_NETWORK !== 'testnet') {
    return fail(c, 403, 'faucet_disabled', 'Faucet is only available on testnet');
  }
  const sb = getSupabase();
  if (!sb) return fail(c, 500, 'no_db', 'Database not configured');
  const tg = extractTelegramUser(c);
  if (!tg) return fail(c, 401, 'no_user', 'No Telegram user in initData');

  const user = await resolveOrCreateUser(sb, tg);
  if (!user) return fail(c, 500, 'user_upsert', 'Could not create user row');
  if (!user.wallet_address) {
    return fail(c, 409, 'no_wallet', 'Connect a TON wallet before claiming the faucet');
  }
  if (user.faucet_claimed_at) {
    return fail(c, 409, 'already_claimed', 'Testnet faucet already claimed');
  }

  // Mark first so two parallel requests can't double-claim.
  const { error: markErr } = await sb
    .from('users')
    .update({ faucet_claimed_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('faucet_claimed_at', null);
  if (markErr) return fail(c, 500, 'db_error', markErr.message);

  try {
    await sendPlainTon(user.wallet_address, FAUCET_AMOUNT);
  } catch (e) {
    logger.error({ err: (e as Error).message, user: user.id }, 'faucet broadcast failed');
    // Roll back the claim so the user can retry.
    await sb.from('users').update({ faucet_claimed_at: null }).eq('id', user.id);
    return fail(c, 502, 'broadcast_failed', 'Faucet broadcast failed; try again');
  }
  // Credit the server-tracked test USDC balance so the wallet UI shows only
  // what we issued (not external testnet TON the user may have grabbed from
  // Tonkeeper or @testgiver_ton_bot).
  const newBalance = (BigInt(user.test_usdc_balance) + FAUCET_AMOUNT).toString();
  const { error: balErr } = await sb
    .from('users')
    .update({ test_usdc_balance: newBalance })
    .eq('id', user.id);
  if (balErr) {
    logger.error({ err: balErr.message, user: user.id }, 'test_usdc_balance credit failed');
  }
  return c.json({ ok: true, amount: FAUCET_AMOUNT.toString(), testUsdcBalance: newBalance });
});

// Client-trust deposit sync. The TMA sends an on-chain top-up to the vault via
// TonConnect (we have no server-side hook into that path), then calls this
// endpoint with the same amount so the server-tracked test USDC balance
// reflects the move. The vault's on-chain balance is the real source of truth;
// this column only feeds the wallet-balance UI line. Underflow clamps at 0.
const BalanceDepositBody = z.object({
  amount: z.string().regex(/^\d+$/),
});

me.post('/balance/deposit', async (c) => {
  const sb = getSupabase();
  if (!sb) return fail(c, 500, 'no_db', 'Database not configured');
  const tg = extractTelegramUser(c);
  if (!tg) return fail(c, 401, 'no_user', 'No Telegram user in initData');
  const body = await c.req.json().catch(() => null);
  const parsed = BalanceDepositBody.safeParse(body);
  if (!parsed.success) return fail(c, 400, 'invalid_body', parsed.error.message);

  const user = await resolveOrCreateUser(sb, tg);
  if (!user) return fail(c, 500, 'user_upsert', 'Could not create user row');

  const amount = BigInt(parsed.data.amount);
  const current = BigInt(user.test_usdc_balance);
  const next = current > amount ? current - amount : 0n;
  const { error } = await sb
    .from('users')
    .update({ test_usdc_balance: next.toString() })
    .eq('id', user.id);
  if (error) return fail(c, 500, 'db_error', error.message);
  return c.json({ ok: true, testUsdcBalance: next.toString() });
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
