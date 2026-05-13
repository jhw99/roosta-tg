/**
 * Encoders for the TON message bodies our contracts accept.
 *
 * Opcodes and field layouts are taken verbatim from the Tact-generated
 * wrappers under packages/contracts/build/. Round-trip encode↔decode tests
 * live in __tests__/contractMessages.spec.ts and consume the generated
 * `loadX` functions directly to keep the two in lock-step.
 */
import { Address, beginCell, type Cell } from '@ton/core';

// Opcodes (32-bit, big-endian) — see KyeFactory_KyeFactory.ts
export const OP_CREATE_KYE = 1778788698; // 0x6a0d4b1a
export const OP_JOIN_KYE = 1824226712; // 0x6cbb7d98
export const OP_CONTRIBUTE = 63744915; // 0x03cccb13
export const OP_EXECUTE_ROUND = 61527130; // 0x03aaaa1a
export const OP_CLAIM_REFUND = 4002798760; // F-02 pull-refund
export const OP_TOP_UP = 1875803581;       // F-05 OrganizerCover top-up
export const OP_EMERGENCY_CANCEL = 2176964709;

export interface CreateKyeParams {
  organizer: Address;
  memberCount: bigint;
  contribution: bigint;
  roundIntervalSec: bigint;
  feeRateBps: bigint;
  timeAdjustmentMaxBps: bigint;
  defaultPolicy: bigint;
  salt: bigint;
}

export function buildCreateKyeBody(params: CreateKyeParams): Cell {
  return beginCell()
    .storeUint(OP_CREATE_KYE, 32)
    .storeAddress(params.organizer)
    .storeUint(params.memberCount, 8)
    .storeCoins(params.contribution)
    .storeUint(params.roundIntervalSec, 32)
    .storeUint(params.feeRateBps, 16)
    .storeUint(params.timeAdjustmentMaxBps, 16)
    .storeUint(params.defaultPolicy, 8)
    .storeUint(params.salt, 64)
    .endCell();
}

export function buildJoinKyeBody(orderNum: bigint | number): Cell {
  return beginCell()
    .storeUint(OP_JOIN_KYE, 32)
    .storeUint(BigInt(orderNum), 8)
    .endCell();
}

export function buildContributeBody(roundNum: bigint | number): Cell {
  return beginCell()
    .storeUint(OP_CONTRIBUTE, 32)
    .storeUint(BigInt(roundNum), 16)
    .endCell();
}

/** Convenience for TonConnect: convert a Cell body to a base64-BOC string. */
export function cellToBase64(cell: Cell): string {
  return cell.toBoc().toString('base64');
}

export function buildExecuteRoundBody(nonce: bigint | number = 0n): Cell {
  return beginCell()
    .storeUint(OP_EXECUTE_ROUND, 32)
    .storeUint(BigInt(nonce), 32)
    .endCell();
}

/** F-02: member claims their queued refund after EmergencyCancel / Cancel-policy. */
export function buildClaimRefundBody(queryId: bigint | number = 0n): Cell {
  return beginCell()
    .storeUint(OP_CLAIM_REFUND, 32)
    .storeUint(BigInt(queryId), 64)
    .endCell();
}

/** F-05: organizer tops up the contract to cover OrganizerCover shortfalls. */
export function buildTopUpBody(queryId: bigint | number = 0n): Cell {
  return beginCell()
    .storeUint(OP_TOP_UP, 32)
    .storeUint(BigInt(queryId), 64)
    .endCell();
}

export function buildEmergencyCancelBody(reason: bigint | number = 0n): Cell {
  return beginCell()
    .storeUint(OP_EMERGENCY_CANCEL, 32)
    .storeUint(BigInt(reason), 8)
    .endCell();
}
