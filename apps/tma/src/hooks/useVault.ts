'use client';

import { useCallback, useEffect, useState } from 'react';
import { Address } from '@ton/core';
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import {
  getOrCreateSessionKey,
  sessionPubKeyBigInt,
  sessionPubKeyHex,
} from '../lib/sessionKey';
import {
  buildActivationMessage,
  buildTopUpMessage,
  fetchVaultState,
  predictVaultAddress,
  registerVault,
  type VaultState,
} from '../lib/vault';

export interface UseVault {
  /** Connected owner wallet (TonConnect), or '' if not connected. */
  ownerAddress: string;
  /** Deterministic vault address once the owner wallet is known. */
  vaultAddress: string | null;
  /** On-chain state — deployed flag, balance, seqno. */
  state: VaultState | null;
  loading: boolean;
  error: string | null;
  /** True when the vault is deployed and usable for gasless intents. */
  ready: boolean;
  /** Run the one-time activation: deploy the vault, then register it. */
  activate: (fundingTon?: string) => Promise<void>;
  /** Top up an already-deployed vault with a plain transfer from the owner wallet. */
  topUp: (amountTon: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Vault lifecycle for the TMA. Computes the deterministic vault address from the
 * connected wallet + session key, reads its on-chain state, and runs the
 * one-time activation transaction. See docs/GASLESS_ARCHITECTURE.md.
 */
export function useVault(): UseVault {
  const ownerAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [state, setState] = useState<VaultState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive the vault address whenever the owner wallet changes.
  useEffect(() => {
    let cancelled = false;
    if (!ownerAddress) {
      setVaultAddress(null);
      setState(null);
      return;
    }
    (async () => {
      try {
        const session = await getOrCreateSessionKey();
        const addr = await predictVaultAddress(
          Address.parse(ownerAddress),
          sessionPubKeyBigInt(session),
        );
        if (!cancelled) setVaultAddress(addr.toString());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'vault derivation failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerAddress]);

  const refresh = useCallback(async () => {
    if (!vaultAddress) return;
    setLoading(true);
    setError(null);
    try {
      setState(await fetchVaultState(vaultAddress));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to read vault state');
    } finally {
      setLoading(false);
    }
  }, [vaultAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activate = useCallback(
    async (fundingTon?: string) => {
      if (!ownerAddress) throw new Error('Connect a TON wallet first.');
      setLoading(true);
      setError(null);
      try {
        const session = await getOrCreateSessionKey();
        const pubKey = sessionPubKeyBigInt(session);
        const owner = Address.parse(ownerAddress);
        const msg = await buildActivationMessage(owner, pubKey, fundingTon);

        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 360,
          messages: [{ address: msg.address, amount: msg.amount, stateInit: msg.stateInit }],
        });

        // Register the vault with the backend (idempotent, address-checked).
        await registerVault(owner, pubKey, sessionPubKeyHex(session));
        setVaultAddress(msg.address);

        // Poll until the chain confirms deployment (funding tx settles).
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const s = await fetchVaultState(msg.address);
          if (s.deployed) {
            setState(s);
            return;
          }
        }
        // Not fatal — the tx may still be settling; surface a soft state.
        setState(await fetchVaultState(msg.address));
      } catch (e) {
        const m = e instanceof Error ? e.message : 'activation failed';
        setError(m);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [ownerAddress, tonConnectUI],
  );

  const topUp = useCallback(
    async (amountTon: string) => {
      if (!vaultAddress) throw new Error('Vault address not derived yet.');
      setLoading(true);
      setError(null);
      try {
        const before = state?.balance ?? 0n;
        const msg = buildTopUpMessage(vaultAddress, amountTon);
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 360,
          messages: [{ address: msg.address, amount: msg.amount }],
        });
        // Poll until the balance bump lands (or give up after ~45s).
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const s = await fetchVaultState(vaultAddress);
          setState(s);
          if (s.balance > before) break;
        }
      } catch (e) {
        const m = e instanceof Error ? e.message : 'top-up failed';
        setError(m);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [vaultAddress, tonConnectUI, state?.balance],
  );

  return {
    ownerAddress,
    vaultAddress,
    state,
    loading,
    error,
    ready: !!state?.deployed,
    activate,
    topUp,
    refresh,
  };
}
