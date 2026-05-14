/**
 * RoostaVault helpers for the backend relayer.
 *
 * - `predictVaultAddress` — deterministic address from (owner, sessionPubKey),
 *   mirrors the TMA's client-side prediction so both agree before the vault is
 *   even deployed.
 * - `readVaultState` — on-chain pubkey + seqno of a deployed vault, used by the
 *   relayer to reject stale / forged intents before spending gas.
 */
import { Address, type Cell } from '@ton/core';
import { TonClient } from '@ton/ton';
import { RoostaVault } from 'contracts/build/RoostaVault/RoostaVault_RoostaVault';
import { getTonClient } from '../indexer/tonClient.js';

/** Deterministic vault address for a given owner wallet + session public key. */
export async function predictVaultAddress(
  owner: Address,
  sessionPubKey: bigint,
): Promise<Address> {
  const init = await RoostaVault.init(owner, sessionPubKey);
  // Tact contracts deploy on workchain 0.
  const { contractAddress } = await import('@ton/core');
  return contractAddress(0, init);
}

export interface VaultState {
  deployed: boolean;
  pubKey: bigint;
  seqno: bigint;
  /** nanoTON balance held by the vault. */
  balance: bigint;
}

/**
 * Read a deployed vault's pubkey + seqno + balance. Returns `deployed: false`
 * if the contract is not yet active on-chain (owner hasn't funded it).
 */
export async function readVaultState(
  vaultAddress: Address,
  client: TonClient = getTonClient(),
): Promise<VaultState> {
  const state = await client.getContractState(vaultAddress);
  if (state.state !== 'active') {
    return { deployed: false, pubKey: 0n, seqno: 0n, balance: state.balance ?? 0n };
  }
  const vault = client.open(RoostaVault.fromAddress(vaultAddress));
  const [pubKey, seqno] = await Promise.all([vault.getPubKey(), vault.getCurrentSeqno()]);
  return { deployed: true, pubKey, seqno, balance: state.balance ?? 0n };
}

/** Re-export for callers that need the raw wrapper (e.g. message decoding). */
export type { Cell };
