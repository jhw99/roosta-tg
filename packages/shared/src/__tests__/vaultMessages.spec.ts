import { describe, it, expect } from 'vitest';
import { Address, beginCell } from '@ton/core';
import { keyPairFromSeed, signVerify } from '@ton/crypto';
import {
  buildSignedIntentCell,
  buildVaultExecuteBody,
  parseVaultExecuteBody,
  signIntent,
  type VaultIntent,
} from '../vaultMessages.js';

const vault = Address.parse('EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t');
const target = Address.parse('EQC_bLp6_c49lMtgAr03DJum9XijYxl4qTGKZV7FUheKdU2p');

function makeIntent(): VaultIntent {
  return {
    seqno: 3n,
    validUntil: 1893456000n,
    target,
    amount: 1_500_000_000n,
    mode: 1n,
    body: beginCell().storeUint(0x6a0d4b1a, 32).endCell(),
  };
}

describe('vaultMessages', () => {
  it('signs an intent and the signature verifies against the session pubkey', () => {
    const kp = keyPairFromSeed(Buffer.alloc(32, 42));
    const intent = makeIntent();
    const sig = signIntent(intent, vault, kp.secretKey);
    const hash = buildSignedIntentCell(intent, vault).hash();
    expect(signVerify(hash, sig, kp.publicKey)).toBe(true);
  });

  it('a different vault address produces a different signed hash (domain separation)', () => {
    const intent = makeIntent();
    const h1 = buildSignedIntentCell(intent, vault).hash();
    const h2 = buildSignedIntentCell(intent, target).hash();
    expect(h1.equals(h2)).toBe(false);
  });

  it('buildVaultExecuteBody round-trips through parseVaultExecuteBody', () => {
    const kp = keyPairFromSeed(Buffer.alloc(32, 7));
    const intent = makeIntent();
    const sig = signIntent(intent, vault, kp.secretKey);
    const body = buildVaultExecuteBody(intent, sig);
    const parsed = parseVaultExecuteBody(body);
    expect(parsed.intent.seqno).toBe(intent.seqno);
    expect(parsed.intent.validUntil).toBe(intent.validUntil);
    expect(parsed.intent.target.toString()).toBe(intent.target.toString());
    expect(parsed.intent.amount).toBe(intent.amount);
    expect(parsed.intent.mode).toBe(intent.mode);
    expect(parsed.intent.body.equals(intent.body)).toBe(true);
    expect(parsed.signature.equals(sig)).toBe(true);
  });
});
