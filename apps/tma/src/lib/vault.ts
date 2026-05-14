'use client';

/**
 * RoostaVault helpers for the TMA — deterministic address prediction, the
 * one-time activation transaction, and the gasless intent/relay path.
 * See docs/GASLESS_ARCHITECTURE.md.
 */
import {
  Address,
  Cell,
  beginCell,
  contractAddress,
  storeStateInit,
  toNano,
  type StateInit,
} from '@ton/core';
import { RoostaVault } from 'contracts/build/RoostaVault/RoostaVault_RoostaVault';
import {
  signIntent,
  SEND_MODE_PAY_GAS_SEPARATELY,
  type VaultIntent,
} from '@roosta/shared/vaultMessages';
import type { KeyPair } from '@ton/crypto';
import { getSessionKey, sessionPubKeyBigInt } from './sessionKey';
import { api } from './api';

/** Gas the relayer attaches; the vault must hold at least this for storage rent. */
export const VAULT_MIN_GAS = toNano('0.05');

/** StateInit (code + data) for a vault owned by `owner` with session key `pubKey`. */
export async function vaultStateInit(owner: Address, pubKey: bigint): Promise<StateInit> {
  return RoostaVault.init(owner, pubKey);
}

/** Deterministic vault address for `(owner, sessionPubKey)`. */
export async function predictVaultAddress(owner: Address, pubKey: bigint): Promise<Address> {
  const init = await vaultStateInit(owner, pubKey);
  return contractAddress(0, init);
}

/** Base64 BOC of the StateInit, for the TonConnect `stateInit` field. */
export async function vaultStateInitBase64(owner: Address, pubKey: bigint): Promise<string> {
  const init = await vaultStateInit(owner, pubKey);
  return beginCell().store(storeStateInit(init)).endCell().toBoc().toString('base64');
}

export interface VaultState {
  deployed: boolean;
  seqno: bigint;
  balance: bigint;
}

/** Read the vault's on-chain state via the backend relay endpoint. */
export async function fetchVaultState(vaultAddress: string): Promise<VaultState> {
  const res = await api.vaultState(vaultAddress);
  return {
    deployed: res.deployed,
    seqno: BigInt(res.seqno),
    balance: BigInt(res.balance),
  };
}

/**
 * Build the one-time TonConnect activation message: deploy + fund the vault in
 * a single transaction signed by the user's real wallet. This is the only gas
 * the user ever pays.
 */
export async function buildActivationMessage(
  owner: Address,
  pubKey: bigint,
  fundingTon: string,
): Promise<{ address: string; amount: string; stateInit: string }> {
  const address = (await predictVaultAddress(owner, pubKey)).toString();
  const stateInit = await vaultStateInitBase64(owner, pubKey);
  return { address, amount: toNano(fundingTon).toString(), stateInit };
}

/**
 * Sign a vault intent with the session key and submit it to the relayer.
 * `target`/`body` describe the inner message (e.g. CreateKye to the factory).
 * `amount` is the nanoTON the vault forwards from its own balance.
 */
export async function signAndRelay(params: {
  vaultAddress: string;
  target: Address;
  amount: bigint;
  body: Cell;
  /** Seconds the intent stays valid (default 300). */
  ttlSec?: number;
}): Promise<void> {
  const session: KeyPair | null = await getSessionKey();
  if (!session) throw new Error('Vault not activated — set up your vault first.');

  const vaultAddr = Address.parse(params.vaultAddress);
  const state = await fetchVaultState(params.vaultAddress);
  if (!state.deployed) {
    throw new Error('Vault is not funded yet. Complete activation first.');
  }
  if (params.amount > state.balance - VAULT_MIN_GAS) {
    throw new Error('Vault balance too low for this action. Top up your vault.');
  }

  const intent: VaultIntent = {
    seqno: state.seqno,
    validUntil: BigInt(Math.floor(Date.now() / 1000) + (params.ttlSec ?? 300)),
    target: params.target,
    amount: params.amount,
    mode: BigInt(SEND_MODE_PAY_GAS_SEPARATELY),
    body: params.body,
  };

  const signature = signIntent(intent, vaultAddr, session.secretKey);

  await api.relay({
    vaultAddress: params.vaultAddress,
    intent: {
      seqno: intent.seqno.toString(),
      validUntil: intent.validUntil.toString(),
      target: intent.target.toString(),
      amount: intent.amount.toString(),
      mode: Number(intent.mode),
      body: params.body.toBoc().toString('base64'),
    },
    signature: signature.toString('base64'),
  });
}

/** Convenience: register the vault with the backend after activation. */
export async function registerVault(
  owner: Address,
  pubKey: bigint,
  sessionPubkeyHex: string,
): Promise<string> {
  const address = (await predictVaultAddress(owner, pubKey)).toString();
  await api.saveVault(sessionPubkeyHex, address);
  return address;
}
