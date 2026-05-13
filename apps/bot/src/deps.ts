/**
 * Shared dependency bundle threaded through every command handler.
 * Centralizing these makes commands trivially mockable in unit tests.
 */
import type { Logger } from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BackendClient } from './services/backendClient.js';

export interface BotDeps {
  logger: Logger;
  backend: BackendClient;
  /** Service-role client. Null when SUPABASE_* env is missing (dev mode). */
  supabase: SupabaseClient | null;
  tmaUrl: string;
  botUsername: string;
}
