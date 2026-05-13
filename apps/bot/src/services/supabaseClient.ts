/**
 * Service-role Supabase client for the bot.
 *
 * Used for low-latency reads/writes that don't need to go through the backend:
 *   - user language updates (`/lang`)
 *   - kye preview fallback when the backend is unreachable
 *   - kye_groups upserts on /linkkye and /unlinkkye
 *   - referrer tracking on new sign-ups from /start deeplinks
 *
 * Returns null when env is not configured so callers can degrade gracefully.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;
let initialized = false;

export function getSupabase(env: NodeJS.ProcessEnv = process.env): SupabaseClient | null {
  if (initialized) return cached;
  initialized = true;
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** Test helper: clear cached client so a new env can be picked up. */
export function _resetSupabaseForTests(): void {
  cached = null;
  initialized = false;
}

export interface UserRow {
  id: string;
  telegram_id: number;
  language: string;
  wallet_address: string | null;
  referred_by: string | null;
}

export async function findUserByTelegramId(
  sb: SupabaseClient,
  telegramId: number,
): Promise<UserRow | null> {
  const { data } = await sb
    .from('users')
    .select('id, telegram_id, language, wallet_address, referred_by')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  return (data as UserRow | null) ?? null;
}

export async function upsertUserLanguage(
  sb: SupabaseClient,
  telegramId: number,
  language: 'ko' | 'en',
): Promise<boolean> {
  // Use upsert to insert if the user has never opened the TMA.
  const { error } = await sb
    .from('users')
    .upsert(
      { telegram_id: telegramId, language },
      { onConflict: 'telegram_id', ignoreDuplicates: false },
    );
  return !error;
}

export async function recordReferrerIfNew(
  sb: SupabaseClient,
  newUserTelegramId: number,
  referrerTelegramId: number,
): Promise<void> {
  if (newUserTelegramId === referrerTelegramId) return;
  const referrer = await findUserByTelegramId(sb, referrerTelegramId);
  if (!referrer) return;

  // Insert-if-missing pattern; if the user already exists with a referrer, leave it untouched.
  const existing = await findUserByTelegramId(sb, newUserTelegramId);
  if (existing) {
    if (existing.referred_by) return;
    await sb.from('users').update({ referred_by: referrer.id }).eq('id', existing.id);
    return;
  }
  await sb
    .from('users')
    .insert({ telegram_id: newUserTelegramId, referred_by: referrer.id, language: 'en' });
}
