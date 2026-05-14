import type { Context } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TelegramUserClaim {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/** Pull the `user` JSON field out of verified initData params. */
export function extractTelegramUser(c: Context): TelegramUserClaim | null {
  const tg = c.get('tgUser') as Record<string, string> | null | undefined;
  if (!tg) return null;
  const raw = tg.user;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TelegramUserClaim;
  } catch {
    return null;
  }
}

export interface AppUser {
  id: string;
  telegram_id: number;
  wallet_address: string | null;
  language: string;
  vault_address: string | null;
  session_pubkey: string | null;
}

/** Find-or-create the users row for a Telegram user. */
export async function resolveOrCreateUser(
  supabase: SupabaseClient,
  tg: TelegramUserClaim,
): Promise<AppUser | null> {
  const language = (tg.language_code ?? 'en').startsWith('ko') ? 'ko' : 'en';
  const { data: existing } = await supabase
    .from('users')
    .select('id, telegram_id, wallet_address, language, vault_address, session_pubkey')
    .eq('telegram_id', tg.id)
    .maybeSingle();
  if (existing) {
    return {
      id: existing.id as string,
      telegram_id: Number(existing.telegram_id),
      wallet_address: (existing.wallet_address as string) ?? null,
      language: (existing.language as string) ?? 'en',
      vault_address: (existing.vault_address as string) ?? null,
      session_pubkey: (existing.session_pubkey as string) ?? null,
    };
  }
  const { data: inserted, error } = await supabase
    .from('users')
    .insert({ telegram_id: tg.id, language })
    .select('id, telegram_id, wallet_address, language, vault_address, session_pubkey')
    .maybeSingle();
  if (error || !inserted) return null;
  return {
    id: inserted.id as string,
    telegram_id: Number(inserted.telegram_id),
    wallet_address: (inserted.wallet_address as string) ?? null,
    language: (inserted.language as string) ?? language,
    vault_address: (inserted.vault_address as string) ?? null,
    session_pubkey: (inserted.session_pubkey as string) ?? null,
  };
}
