import { Cell, Slice, Address } from '@ton/core';

/**
 * Tact-generated event opcodes (CRC32 of message signature).
 * Source: packages/contracts/build/KyeContract/KyeContract_KyeContract.abi
 */
export const EVENT_OPCODES = {
  KyeCreated: 2693900936,
  MemberJoined: 4164037672,
  KyeActivated: 3111286301,
  RoundExecuted: 523671663,
  DefaultDetected: 1251687681,
  PayoutSent: 3251024742,
  FeeDistributed: 2466659621,
  KyeCompleted: 2131495301,
  KyeCancelled: 1996042817,
  ContributionReceived: 1353814854,
} as const;

export type EventType = keyof typeof EVENT_OPCODES;

export const OPCODE_TO_TYPE: Record<number, EventType> = Object.fromEntries(
  Object.entries(EVENT_OPCODES).map(([k, v]) => [v, k as EventType]),
) as Record<number, EventType>;

export interface DecodedEvent {
  type: EventType;
  opcode: number;
  payload: Record<string, unknown>;
}

function addrStr(s: Slice): string {
  try {
    return s.loadAddress().toString({ urlSafe: true, bounceable: true });
  } catch {
    return '';
  }
}

/**
 * Decode an emitted event cell. The first 32 bits are the message opcode.
 * Returns `null` if the opcode does not match a known Kye event.
 */
export function decodeEvent(cell: Cell): DecodedEvent | null {
  const s = cell.beginParse();
  if (s.remainingBits < 32) return null;
  const opcode = s.loadUint(32);
  const type = OPCODE_TO_TYPE[opcode];
  if (!type) return null;

  const payload: Record<string, unknown> = {};
  try {
    switch (type) {
      case 'KyeCreated':
        payload.organizer = addrStr(s);
        payload.memberCount = s.loadUint(8);
        break;
      case 'MemberJoined':
        payload.member = addrStr(s);
        payload.orderNum = s.loadUint(8);
        break;
      case 'KyeActivated':
        payload.startTimestamp = s.loadUint(32);
        break;
      case 'RoundExecuted':
        payload.roundNum = s.loadUint(16);
        payload.winner = addrStr(s);
        payload.payout = s.loadCoins().toString();
        break;
      case 'DefaultDetected':
        payload.member = addrStr(s);
        payload.roundNum = s.loadUint(16);
        break;
      case 'PayoutSent':
        payload.winner = addrStr(s);
        payload.amount = s.loadCoins().toString();
        break;
      case 'FeeDistributed':
        payload.platform = s.loadCoins().toString();
        payload.organizer = s.loadCoins().toString();
        break;
      case 'KyeCompleted':
        payload.totalRounds = s.loadUint(16);
        break;
      case 'KyeCancelled':
        payload.reason = s.loadUint(8);
        break;
      case 'ContributionReceived':
        payload.member = addrStr(s);
        payload.roundNum = s.loadUint(16);
        payload.amount = s.loadCoins().toString();
        break;
    }
  } catch {
    // Partial decode is fine — return what we have.
  }
  return { type, opcode, payload };
}

/** Build a synthetic event cell for tests. */
export function encodeEventForTest(type: EventType, payload: Record<string, unknown>): Cell {
  const { beginCell } = require('@ton/core') as typeof import('@ton/core');
  const b = beginCell().storeUint(EVENT_OPCODES[type], 32);
  const zeroAddr = new Address(0, Buffer.alloc(32, 0));
  switch (type) {
    case 'KyeCreated':
      b.storeAddress((payload.organizer as Address) ?? zeroAddr);
      b.storeUint(payload.memberCount as number, 8);
      break;
    case 'MemberJoined':
      b.storeAddress((payload.member as Address) ?? zeroAddr);
      b.storeUint(payload.orderNum as number, 8);
      break;
    case 'KyeActivated':
      b.storeUint(payload.startTimestamp as number, 32);
      break;
    case 'RoundExecuted':
      b.storeUint(payload.roundNum as number, 16);
      b.storeAddress((payload.winner as Address) ?? zeroAddr);
      b.storeCoins(BigInt(payload.payout as string | number));
      break;
    case 'DefaultDetected':
      b.storeAddress((payload.member as Address) ?? zeroAddr);
      b.storeUint(payload.roundNum as number, 16);
      break;
    case 'PayoutSent':
      b.storeAddress((payload.winner as Address) ?? zeroAddr);
      b.storeCoins(BigInt(payload.amount as string | number));
      break;
    case 'FeeDistributed':
      b.storeCoins(BigInt(payload.platform as string | number));
      b.storeCoins(BigInt(payload.organizer as string | number));
      break;
    case 'KyeCompleted':
      b.storeUint(payload.totalRounds as number, 16);
      break;
    case 'KyeCancelled':
      b.storeUint(payload.reason as number, 8);
      break;
    case 'ContributionReceived':
      b.storeAddress((payload.member as Address) ?? zeroAddr);
      b.storeUint(payload.roundNum as number, 16);
      b.storeCoins(BigInt(payload.amount as string | number));
      break;
  }
  return b.endCell();
}
