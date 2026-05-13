/** Shared domain types. Timestamps are Unix seconds. Amounts are USDT minor units (6 decimals). */

export type KyeStatus = 'created' | 'active' | 'completed' | 'cancelled';
export type MemberStatus = 'active' | 'defaulted' | 'paid_out';
export type DefaultPolicy = 'pro_rata' | 'cancel' | 'organizer_cover';

export interface KyeParams {
  N: number;
  contribution: bigint;
  roundIntervalSec: number;
  feeRateBps: number;
  alphaMaxBps: number;
  defaultPolicy: DefaultPolicy;
}

export interface Kye {
  id: string;
  contractAddress: string;
  organizerId: string;
  name: string;
  params: KyeParams;
  status: KyeStatus;
  createdAt: number;
}

export interface Member {
  id: string;
  kyeId: string;
  userId: string;
  orderNum: number;
  joinedAt: number;
  status: MemberStatus;
}

export interface Round {
  id: string;
  kyeId: string;
  roundNum: number;
  scheduledAt: number;
  executedAt: number | null;
  winnerId: string | null;
  payout: bigint | null;
  txHash: string | null;
}

export type KyeEventType =
  | 'KyeCreated'
  | 'MemberJoined'
  | 'KyeActivated'
  | 'RoundExecuted'
  | 'DefaultDetected'
  | 'PayoutSent'
  | 'FeeDistributed'
  | 'KyeCompleted'
  | 'KyeCancelled';

export interface KyeEvent {
  id: string;
  kyeId: string;
  eventType: KyeEventType;
  payload: Record<string, unknown>;
  txHash: string | null;
  processedAt: number;
}

export interface NotificationSetting {
  userId: string;
  key: string;
  value: boolean;
}
