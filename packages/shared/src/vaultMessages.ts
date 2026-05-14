/**
 * Encoders + signing helpers for RoostaVault (the gasless proxy contract).
 *
 * Layouts are taken verbatim from the Tact-generated wrapper at
 * packages/contracts/build/RoostaVault/RoostaVault_RoostaVault.ts. Two layouts
 * matter and they MUST stay in lock-step with RoostaVault.tact:
 *
 *  1. The "signed cell" — what the session key signs. Mirrors the
 *     `beginCell()...endCell()` in the contract's `receive(VaultExecute)`.
 *  2. The `VaultExecute` message body — what the relayer delivers on-chain.
 *
 * See docs/GASLESS_ARCHITECTURE.md.
 */
import { Address, beginCell, Cell, type Slice } from '@ton/core';
import { sign } from '@ton/crypto';

// Opcodes (32-bit, big-endian) — see RoostaVault_RoostaVault.ts
export const OP_VAULT_EXECUTE = 4238182918; // 0xfc9d8a06
export const OP_OWNER_WITHDRAW = 895583217; // 0x356585f1

/** TON send mode the relayer path uses: pay gas separately from the forwarded value. */
export const SEND_MODE_PAY_GAS_SEPARATELY = 1;

export interface VaultIntent {
  /** Must equal the vault's current on-chain seqno. */
  seqno: bigint;
  /** Unix seconds; the contract rejects `now() > validUntil`. */
  validUntil: bigint;
  /** Inner message recipient (KyeFactory, a KyeContract, or the owner). */
  target: Address;
  /** nanoTON forwarded to `target` from the vault balance. */
  amount: bigint;
  /** TON send mode for the forwarded message. */
  mode: bigint;
  /** Inner message body (e.g. buildCreateKyeBody / buildJoinKyeBody output). */
  body: Cell;
}

/**
 * Build the exact cell the contract hashes for signature verification.
 * Mirrors `receive(VaultExecute)` in RoostaVault.tact — order and widths must
 * match byte-for-byte, including the trailing `myAddress()` (the vault's own
 * address), which domain-separates intents per vault.
 */
export function buildSignedIntentCell(intent: VaultIntent, vaultAddress: Address): Cell {
  return beginCell()
    .storeUint(intent.seqno, 64)
    .storeUint(intent.validUntil, 32)
    .storeAddress(intent.target)
    .storeCoins(intent.amount)
    .storeUint(intent.mode, 8)
    .storeAddress(vaultAddress)
    .storeRef(intent.body)
    .endCell();
}

/** Sign an intent with the session secret key. Returns the 64-byte signature. */
export function signIntent(
  intent: VaultIntent,
  vaultAddress: Address,
  secretKey: Buffer,
): Buffer {
  const signed = buildSignedIntentCell(intent, vaultAddress);
  return sign(signed.hash(), secretKey);
}

/**
 * Build the `VaultExecute` message body the relayer delivers on-chain.
 * `signature` is the 64-byte ed25519 signature over `buildSignedIntentCell`.
 */
export function buildVaultExecuteBody(intent: VaultIntent, signature: Buffer): Cell {
  return beginCell()
    .storeUint(OP_VAULT_EXECUTE, 32)
    .storeUint(intent.seqno, 64)
    .storeUint(intent.validUntil, 32)
    .storeAddress(intent.target)
    .storeCoins(intent.amount)
    .storeUint(intent.mode, 8)
    .storeRef(intent.body)
    .storeRef(beginCell().storeBuffer(signature).endCell())
    .endCell();
}

/** Convenience: sign + encode in one call. */
export function buildSignedVaultExecuteBody(
  intent: VaultIntent,
  vaultAddress: Address,
  secretKey: Buffer,
): Cell {
  return buildVaultExecuteBody(intent, signIntent(intent, vaultAddress, secretKey));
}

/** Owner-wallet escape hatch: sweep the vault back to the owner. */
export function buildOwnerWithdrawBody(queryId: bigint | number = 0n): Cell {
  return beginCell()
    .storeUint(OP_OWNER_WITHDRAW, 32)
    .storeUint(BigInt(queryId), 64)
    .endCell();
}

/** Parse a `VaultExecute` body back out (used by the relayer to re-validate). */
export function parseVaultExecuteBody(body: Cell): {
  intent: VaultIntent;
  signature: Buffer;
} {
  const sc = body.beginParse();
  if (sc.loadUint(32) !== OP_VAULT_EXECUTE) throw new Error('not a VaultExecute body');
  const seqno = sc.loadUintBig(64);
  const validUntil = sc.loadUintBig(32);
  const target = sc.loadAddress();
  const amount = sc.loadCoins();
  const mode = sc.loadUintBig(8);
  const innerBody = sc.loadRef();
  const sigSlice: Slice = sc.loadRef().beginParse();
  const signature = sigSlice.loadBuffer(64);
  return {
    intent: { seqno, validUntil, target, amount, mode, body: innerBody },
    signature,
  };
}
