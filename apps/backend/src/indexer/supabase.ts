import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../lib/logger.js';

let _client: SupabaseClient | null = null;

/**
 * Returns a Supabase client using the service-role key. Returns `null` if env
 * is not configured (so unit tests / local dev without Supabase can stub it).
 */
export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.warn('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — supabase client disabled');
    return null;
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

/** Test hook — inject a mock client. */
export function __setSupabase(client: SupabaseClient | null): void {
  _client = client;
}
