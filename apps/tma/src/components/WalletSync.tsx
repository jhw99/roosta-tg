'use client';

import { useEffect, useRef } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { api } from '../lib/api';

/**
 * Persists the connected TON wallet address to the backend so server-side
 * flows (create/join circle) can read `users.wallet_address`.
 */
export function WalletSync() {
  const address = useTonAddress();
  const synced = useRef<string | null>(null);

  useEffect(() => {
    if (!address || synced.current === address) return;
    synced.current = address;
    void api.saveWallet(address).catch(() => {
      synced.current = null;
    });
  }, [address]);

  return null;
}
