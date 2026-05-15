import { Hono } from 'hono';
import { z } from 'zod';
import { Address, contractAddress } from '@ton/core';
import { getSupabase } from '../lib/supabase.js';
import { extractTelegramUser, resolveOrCreateUser } from '../lib/currentUser.js';
import { fail } from '../lib/errors.js';
import { KyeContract } from 'contracts/build/KyeContract/KyeContract_KyeContract';
import type { KyeInit } from 'contracts/build/KyeContract/KyeContract_KyeContract';

export const kyes = new Hono();

// ---------------- GET /kyes/:id ----------------

kyes.get('/:id', async (c) => {
  const sb = getSupabase();
  if (!sb) return fail(c, 500, 'no_db', 'Database not configured');
  const id = c.req.param('id');

  const { data: kye } = await sb
    .from('kyes')
    .select(
      'id, name, contract_address, organizer_id, params, status, created_at, organizer:users!kyes_organizer_id_fkey(telegram_id, wallet_address)',
    )
    .eq('contract_address', id)
    .maybeSingle();
  if (!kye) return fail(c, 404, 'not_found', 'Kye not found');

  const organizerRel = (kye as { organizer?: Record<string, unknown> | Record<string, unknown>[] }).organizer;
  const organizer = Array.isArray(organizerRel) ? organizerRel[0] : organizerRel;
  const organizerTelegramId =
    organizer?.telegram_id != null ? Number(organizer.telegram_id) : null;
  const organizerHandle: string | null = null;
  const organizerWalletAddress = (organizer?.wallet_address as string | undefined) ?? null;

  const [{ data: members }, { data: currentRound }] = await Promise.all([
    sb
      .from('kye_members')
      .select('user_id, order_num, status, joined_at')
      .eq('kye_id', kye.id)
      .order('order_num', { ascending: true }),
    sb
      .from('rounds')
      .select('id, round_num, scheduled_at, executed_at, winner_id, payout, tx_hash')
      .eq('kye_id', kye.id)
      .is('executed_at', null)
      .order('round_num', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return c.json({
    kye: {
      id: kye.id,
      name: kye.name,
      contractAddress: kye.contract_address,
      organizerId: kye.organizer_id,
      organizerTelegramId: organizerTelegramId,
      organizerHandle,
      organizerWalletAddress,
      params: kye.params,
      status: kye.status,
      createdAt: kye.created_at,
    },
    members: members ?? [],
    currentRound: currentRound ?? null,
  });
});

// ---------------- GET /kyes/:id/rounds ----------------

kyes.get('/:id/rounds', async (c) => {
  const sb = getSupabase();
  if (!sb) return fail(c, 500, 'no_db', 'Database not configured');
  const id = c.req.param('id');

  const { data: kye } = await sb
    .from('kyes')
    .select('id')
    .eq('contract_address', id)
    .maybeSingle();
  if (!kye) return fail(c, 404, 'not_found', 'Kye not found');

  const { data: rounds, error } = await sb
    .from('rounds')
    .select('id, round_num, scheduled_at, executed_at, winner_id, payout, tx_hash, defaulted_members')
    .eq('kye_id', kye.id)
    .order('round_num', { ascending: false });
  if (error) return fail(c, 500, 'db_error', error.message);

  return c.json({ rounds: rounds ?? [] });
});

// ---------------- POST /kyes ----------------

// Exposed round-interval presets. The contract accepts anything in [60s, 90d];
// this list is the user-facing menu. Remove the leading `60` (one-minute test
// option) before mainnet — no contract redeploy needed.
const ALLOWED_INTERVALS = [60, 7 * 86400, 14 * 86400, 21 * 86400, 28 * 86400];

const CreateKyeBody = z.object({
  name: z.string().min(1).max(64),
  memberCount: z.number().int().min(2).max(30),
  contribution: z.string().regex(/^\d+$/),
  roundIntervalSec: z
    .number()
    .int()
    .refine((v) => ALLOWED_INTERVALS.includes(v), {
      message: 'roundIntervalSec must be 7,14,21, or 28 days',
    }),
  feeRateBps: z.number().int().min(200).max(10_000),
  alphaMaxBps: z.number().int().min(0).max(10_000).default(0),
  defaultPolicy: z.number().int().min(0).max(2),
  // F-13: optional uint64 address-determinism salt. If omitted, the factory
  // will assign one from its monotonic counter.
  salt: z
    .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
    .optional(),
});

/**
 * Predict the deterministic Tact-derived address for a new KyeContract child.
 * Mirrors `KyeContract_init(KyeInit)` from the generated wrapper, then computes
 * `contractAddress(0, { code, data })`. Verified against sandbox deployment in
 * packages/contracts/tests.
 */
async function predictAddress(
  params: z.infer<typeof CreateKyeBody>,
  organizerWallet: string,
  platformTreasury: string,
  salt: bigint,
): Promise<string> {
  const init: KyeInit = {
    $$type: 'KyeInit',
    organizer: Address.parse(organizerWallet),
    memberCount: BigInt(params.memberCount),
    contribution: BigInt(params.contribution),
    roundIntervalSec: BigInt(params.roundIntervalSec),
    feeRateBps: BigInt(params.feeRateBps),
    timeAdjustmentMaxBps: BigInt(params.alphaMaxBps),
    defaultPolicy: BigInt(params.defaultPolicy),
    platformTreasury: Address.parse(platformTreasury),
    salt,
  };
  const stateInit = await KyeContract.init(init);
  const addr = contractAddress(0, stateInit);
  return addr.toString();
}

kyes.post('/', async (c) => {
  const sb = getSupabase();
  if (!sb) return fail(c, 500, 'no_db', 'Database not configured');
  const tg = extractTelegramUser(c);
  if (!tg) return fail(c, 401, 'no_user', 'No Telegram user in initData');

  const body = await c.req.json().catch(() => null);
  const parsed = CreateKyeBody.safeParse(body);
  if (!parsed.success) return fail(c, 400, 'invalid_params', parsed.error.message);

  const contribution = BigInt(parsed.data.contribution);
  if (contribution <= 0n) return fail(c, 400, 'invalid_params', 'contribution must be > 0');

  const user = await resolveOrCreateUser(sb, tg);
  if (!user) return fail(c, 500, 'user_upsert', 'Could not create user row');
  // The vault is the on-chain organizer identity (gasless proxy model).
  if (!user.vault_address) {
    return fail(c, 403, 'no_vault', 'Activate your gasless vault before creating a Kye');
  }
  const platformTreasury = process.env.PLATFORM_TREASURY_ADDRESS;
  if (!platformTreasury) {
    return fail(c, 500, 'no_treasury', 'PLATFORM_TREASURY_ADDRESS is not configured');
  }

  // F-13: caller-supplied salt or a millisecond-precision default that is
  // distinct between calls so identical-param redeploys don't collide.
  const saltVal: bigint = parsed.data.salt !== undefined
    ? BigInt(parsed.data.salt)
    : BigInt(Date.now());
  const predicted = await predictAddress(parsed.data, user.vault_address, platformTreasury, saltVal);

  // Pre-insert the kyes row so the detail page resolves immediately, without
  // waiting for the indexer to catch up to the on-chain KyeCreated event. The
  // indexer's upsert reconciles this row once the event lands.
  const paramsJson = {
    name: parsed.data.name,
    memberCount: parsed.data.memberCount,
    contribution: contribution.toString(),
    roundIntervalSec: parsed.data.roundIntervalSec,
    feeRateBps: parsed.data.feeRateBps,
    alphaMaxBps: parsed.data.alphaMaxBps,
    defaultPolicy: parsed.data.defaultPolicy,
    salt: saltVal.toString(),
  };
  const { error: insertErr } = await sb.from('kyes').upsert(
    {
      contract_address: predicted,
      organizer_id: user.id,
      name: parsed.data.name,
      params: paramsJson,
      status: 'created',
    },
    { onConflict: 'contract_address' },
  );
  if (insertErr) {
    return fail(c, 500, 'db_error', insertErr.message);
  }

  return c.json({
    ok: true,
    params: { ...parsed.data, contribution: contribution.toString(), salt: saltVal.toString() },
    predictedAddress: predicted,
  });
});

// ---------------- POST /kyes/:id/join ----------------

const JoinBody = z.object({
  orderNum: z.number().int().min(1).max(30),
});

kyes.post('/:id/join', async (c) => {
  const sb = getSupabase();
  if (!sb) return fail(c, 500, 'no_db', 'Database not configured');
  const tg = extractTelegramUser(c);
  if (!tg) return fail(c, 401, 'no_user', 'No Telegram user in initData');

  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = JoinBody.safeParse(body);
  if (!parsed.success) return fail(c, 400, 'invalid_body', parsed.error.message);

  const user = await resolveOrCreateUser(sb, tg);
  if (!user) return fail(c, 500, 'user_upsert', 'Could not create user row');
  // The vault is the on-chain member identity (gasless proxy model).
  if (!user.vault_address) {
    return fail(c, 403, 'no_vault', 'Activate your gasless vault before joining');
  }

  const { data: kye } = await sb
    .from('kyes')
    .select('id, organizer_id, status, params')
    .eq('contract_address', id)
    .maybeSingle();
  if (!kye) return fail(c, 404, 'not_found', 'Kye not found');
  if (kye.status !== 'created') {
    return fail(c, 409, 'not_open', 'Kye is not accepting new members');
  }
  if (kye.organizer_id === user.id) {
    return fail(c, 403, 'is_organizer', 'Organizer cannot join their own Kye');
  }
  const memberCount = Number(
    (kye.params as Record<string, unknown> | null)?.memberCount ?? 0,
  );
  if (parsed.data.orderNum > memberCount) {
    return fail(c, 400, 'invalid_order', `orderNum exceeds memberCount (${memberCount})`);
  }

  const { data: existing } = await sb
    .from('kye_members')
    .select('id')
    .eq('kye_id', kye.id)
    .eq('order_num', parsed.data.orderNum)
    .maybeSingle();
  if (existing) return fail(c, 409, 'slot_taken', 'Order is already filled');

  const nowMs = Date.now();
  const expiresAt = new Date(nowMs + 60_000).toISOString();
  const { data: lockExisting } = await sb
    .from('pending_joins')
    .select('user_id, expires_at')
    .eq('kye_id', kye.id)
    .eq('order_num', parsed.data.orderNum)
    .maybeSingle();
  if (
    lockExisting &&
    (lockExisting as { user_id: string }).user_id !== user.id &&
    new Date((lockExisting as { expires_at: string }).expires_at).getTime() > nowMs
  ) {
    return fail(c, 409, 'slot_locked', 'Slot is locked by another user');
  }

  await sb.from('pending_joins').upsert(
    {
      kye_id: kye.id,
      order_num: parsed.data.orderNum,
      user_id: user.id,
      expires_at: expiresAt,
    },
    { onConflict: 'kye_id,order_num' },
  );

  return c.json({ ok: true, kyeId: kye.id, orderNum: parsed.data.orderNum, expiresAt });
});
