import { describe, it, expect } from 'vitest';
import { Address } from '@ton/core';
import {
  buildCreateKyeBody,
  buildJoinKyeBody,
  buildContributeBody,
  buildExecuteRoundBody,
  OP_CREATE_KYE,
  OP_JOIN_KYE,
  OP_CONTRIBUTE,
  OP_EXECUTE_ROUND,
} from '../contractMessages.js';
import {
  loadJoinKye,
  loadContribute,
  loadExecuteRound,
  loadCreateKye,
} from 'contracts/build/KyeFactory/KyeFactory_KyeFactory';

const ZERO = new Address(0, Buffer.alloc(32, 0));

describe('contractMessages round-trip', () => {
  it('CreateKye encode↔decode', () => {
    const body = buildCreateKyeBody({
      organizer: ZERO,
      memberCount: 5n,
      contribution: 1_000_000n,
      roundIntervalSec: 604800n,
      feeRateBps: 300n,
      timeAdjustmentMaxBps: 100n,
      defaultPolicy: 1n,
      salt: 42n,
    });
    const parsed = loadCreateKye(body.beginParse());
    expect(parsed.$$type).toBe('CreateKye');
    expect(parsed.organizer.equals(ZERO)).toBe(true);
    expect(parsed.memberCount).toBe(5n);
    expect(parsed.contribution).toBe(1_000_000n);
    expect(parsed.roundIntervalSec).toBe(604800n);
    expect(parsed.feeRateBps).toBe(300n);
    expect(parsed.timeAdjustmentMaxBps).toBe(100n);
    expect(parsed.defaultPolicy).toBe(1n);
    expect(parsed.salt).toBe(42n);
    expect(body.beginParse().preloadUint(32)).toBe(OP_CREATE_KYE);
  });

  it('JoinKye encode↔decode', () => {
    const body = buildJoinKyeBody(3);
    const parsed = loadJoinKye(body.beginParse());
    expect(parsed.orderNum).toBe(3n);
    expect(body.beginParse().preloadUint(32)).toBe(OP_JOIN_KYE);
  });

  it('Contribute encode↔decode', () => {
    const body = buildContributeBody(7);
    const parsed = loadContribute(body.beginParse());
    expect(parsed.roundNum).toBe(7n);
    expect(body.beginParse().preloadUint(32)).toBe(OP_CONTRIBUTE);
  });

  it('ExecuteRound encode↔decode', () => {
    const body = buildExecuteRoundBody(11);
    const parsed = loadExecuteRound(body.beginParse());
    expect(parsed.nonce).toBe(11n);
    expect(body.beginParse().preloadUint(32)).toBe(OP_EXECUTE_ROUND);
  });
});
