import { logger } from '../lib/logger.js';
import { getSupabase } from './supabase.js';

/**
 * Registry of Kye contract addresses to poll. New addresses are produced by
 * `KyeCreated` events at the factory address (set via TON_FACTORY_ADDRESS).
 */
export class ContractRegistry {
  private readonly addresses = new Set<string>();

  constructor(initial: Iterable<string> = []) {
    for (const a of initial) this.addresses.add(a);
  }

  list(): string[] {
    return [...this.addresses];
  }

  register(address: string): boolean {
    if (this.addresses.has(address)) return false;
    this.addresses.add(address);
    logger.info({ address }, 'registered contract for indexing');
    return true;
  }

  unregister(address: string): boolean {
    return this.addresses.delete(address);
  }

  async loadFromDb(): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from('kyes').select('contract_address').neq('status', 'cancelled');
    if (error) {
      logger.warn({ err: error.message }, 'failed to load kye addresses');
      return;
    }
    for (const row of data ?? []) {
      if (row.contract_address) this.addresses.add(row.contract_address as string);
    }
  }
}
