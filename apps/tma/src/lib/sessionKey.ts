'use client';

/**
 * Session key — the ed25519 keypair that authorizes gasless vault intents.
 *
 * Generated once during vault activation and persisted in Telegram CloudStorage
 * (survives reinstalls, synced per-user) with a localStorage fallback for the
 * desktop web client. The user's real TonConnect wallet signs only the one-time
 * funding transaction; this key signs every intent thereafter. See
 * docs/GASLESS_ARCHITECTURE.md.
 */
import { keyPairFromSeed, type KeyPair } from '@ton/crypto';
import { getWebApp } from './webapp';

const STORAGE_KEY = 'roosta_session_seed_v1';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

async function cloudGet(key: string): Promise<string | null> {
  const wa = await getWebApp();
  const cs = (wa as unknown as { CloudStorage?: CloudStorage })?.CloudStorage;
  if (!cs?.getItem) return null;
  return new Promise((resolve) => {
    cs.getItem(key, (err, value) => resolve(err || !value ? null : value));
  });
}

async function cloudSet(key: string, value: string): Promise<void> {
  const wa = await getWebApp();
  const cs = (wa as unknown as { CloudStorage?: CloudStorage })?.CloudStorage;
  if (!cs?.setItem) return;
  await new Promise<void>((resolve) => {
    cs.setItem(key, value, () => resolve());
  });
}

interface CloudStorage {
  getItem(key: string, cb: (err: unknown, value?: string) => void): void;
  setItem(key: string, value: string, cb?: (err: unknown, ok?: boolean) => void): void;
}

/** Read the persisted session seed from CloudStorage, falling back to localStorage. */
async function loadSeed(): Promise<Buffer | null> {
  const cloud = await cloudGet(STORAGE_KEY);
  if (cloud && /^[0-9a-f]{64}$/i.test(cloud)) return fromHex(cloud);
  if (typeof localStorage !== 'undefined') {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local && /^[0-9a-f]{64}$/i.test(local)) {
      // Backfill CloudStorage so it syncs going forward.
      void cloudSet(STORAGE_KEY, local);
      return fromHex(local);
    }
  }
  return null;
}

async function persistSeed(seedHex: string): Promise<void> {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, seedHex);
  await cloudSet(STORAGE_KEY, seedHex);
}

/**
 * Return the persisted session keypair, generating + persisting a fresh one on
 * first use. Idempotent — repeated calls return the same key.
 */
export async function getOrCreateSessionKey(): Promise<KeyPair> {
  let seed = await loadSeed();
  if (!seed) {
    const random = new Uint8Array(32);
    crypto.getRandomValues(random);
    const seedHex = toHex(random);
    await persistSeed(seedHex);
    seed = fromHex(seedHex);
  }
  return keyPairFromSeed(seed);
}

/** Return the persisted session keypair, or null if the vault was never set up. */
export async function getSessionKey(): Promise<KeyPair | null> {
  const seed = await loadSeed();
  return seed ? keyPairFromSeed(seed) : null;
}

/** Session public key as a 64-char hex string (matches the contract's uint256). */
export function sessionPubKeyHex(kp: KeyPair): string {
  return kp.publicKey.toString('hex');
}

/** Session public key as a bigint (for RoostaVault.init / address prediction). */
export function sessionPubKeyBigInt(kp: KeyPair): bigint {
  return BigInt('0x' + kp.publicKey.toString('hex'));
}
