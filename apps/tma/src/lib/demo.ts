/**
 * Demo-mode fixtures used to populate the TMA when the URL contains `?demo=1`.
 * Pages that call `api.*` will receive these synthetic payloads instead of
 * hitting the backend. See scripts/capture-userguide.ts for usage.
 */

import type {
  ApiKye,
  ApiMember,
  ApiRound,
  ApiUser,
} from './api';

export const DEMO_FLAG_KEY = 'roosta.demoMode';

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.sessionStorage.getItem(DEMO_FLAG_KEY) === '1') return true;
  if (window.location.search.includes('demo=1')) return true;
  return false;
}

export function markDemoMode(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(DEMO_FLAG_KEY, '1');
}

export const DEMO_USER: ApiUser = {
  id: 'demo-user',
  telegramId: '12345',
  walletAddress: 'EQDemoOrganizerWallet1234567890abcdefghijk',
  language: 'en',
  createdAt: 1_731_000_000,
};

const NOW = Math.floor(Date.now() / 1000);
const WEEK = 7 * 24 * 3600;

export const DEMO_KYE_PRIMARY: ApiKye = {
  id: 'demo-kye-1',
  contractAddress: 'EQDemoKyeAddressForGuideScreenshotsxxxxxxxxxxx',
  organizerId: 'demo-user',
  organizerHandle: 'jhenry',
  organizerWallet: 'EQDemoOrganizerWallet1234567890abcdefghijk',
  organizerTelegramId: 12345,
  organizerWalletAddress: 'EQDemoOrganizerWallet1234567890abcdefghijk',
  name: 'Hangang Writers Weekly Savings',
  params: {
    N: 5,
    contribution: '100000000', // 100 USDT (6-decimals)
    roundIntervalSec: WEEK,
    feeRateBps: 300,
    alphaMaxBps: 1000,
    defaultPolicy: 'pro_rata',
  },
  status: 'active',
  memberCount: 5,
  currentRound: 2,
  nextRoundAt: NOW + 3 * 24 * 3600,
  createdAt: NOW - 14 * 24 * 3600,
};

export const DEMO_KYE_SECONDARY: ApiKye = {
  id: 'demo-kye-2',
  contractAddress: 'EQDemoSecondaryKye2222222222222222222222222',
  organizerId: 'demo-user',
  organizerHandle: 'jhenry',
  organizerWallet: 'EQDemoOrganizerWallet1234567890abcdefghijk',
  organizerTelegramId: 12345,
  organizerWalletAddress: 'EQDemoOrganizerWallet1234567890abcdefghijk',
  name: 'Discord Traders Circle',
  params: {
    N: 6,
    contribution: '50000000',
    roundIntervalSec: WEEK * 2,
    feeRateBps: 200,
    alphaMaxBps: 500,
    defaultPolicy: 'cancel',
  },
  status: 'created',
  memberCount: 2,
  currentRound: 0,
  nextRoundAt: null,
  createdAt: NOW - 2 * 24 * 3600,
};

export const DEMO_KYES: ApiKye[] = [DEMO_KYE_PRIMARY, DEMO_KYE_SECONDARY];

export const DEMO_MEMBERS_PRIMARY: ApiMember[] = [
  {
    id: 'm1',
    userId: 'u-alice',
    handle: 'alice',
    walletAddress: 'EQM1AliceWalletAddress00000000000000000000',
    orderNum: 1,
    status: 'paid_out',
    currentRoundStatus: 'paid',
  },
  {
    id: 'm2',
    userId: 'u-bob',
    handle: 'bob',
    walletAddress: 'EQM2BobWalletAddress0000000000000000000000',
    orderNum: 2,
    status: 'active',
    currentRoundStatus: 'paid',
  },
  {
    id: 'm3',
    userId: 'demo-user',
    handle: 'jhenry',
    walletAddress: 'EQDemoOrganizerWallet1234567890abcdefghijk',
    orderNum: 3,
    status: 'active',
    currentRoundStatus: 'pending',
    isMe: true,
  },
  {
    id: 'm4',
    userId: 'u-dave',
    handle: 'dave',
    walletAddress: 'EQM4DaveWalletAddress000000000000000000000',
    orderNum: 4,
    status: 'active',
    currentRoundStatus: 'pending',
  },
  {
    id: 'm5',
    userId: 'u-eve',
    handle: 'eve',
    walletAddress: 'EQM5EveWalletAddress0000000000000000000000',
    orderNum: 5,
    status: 'active',
    currentRoundStatus: 'pending',
  },
];

export const DEMO_MEMBERS_SECONDARY: ApiMember[] = [
  {
    id: 's1',
    userId: 'u-t1',
    handle: 'trader1',
    walletAddress: 'EQT1Trader1Wallet0000000000000000000000000',
    orderNum: 1,
    status: 'active',
    currentRoundStatus: 'pending',
  },
  {
    id: 's2',
    userId: 'u-t2',
    handle: 'trader2',
    walletAddress: 'EQT2Trader2Wallet0000000000000000000000000',
    orderNum: 2,
    status: 'active',
    currentRoundStatus: 'pending',
  },
];

export const DEMO_ROUNDS: ApiRound[] = [
  {
    id: 'r1',
    roundNum: 1,
    scheduledAt: NOW - 7 * 24 * 3600,
    executedAt: NOW - 7 * 24 * 3600 + 3600,
    winnerId: 'u-alice',
    winnerHandle: 'alice',
    payout: '485000000',
    txHash: 'demoTxHash1abcdef1234567890abcdef1234567890',
    defaulters: [],
  },
  {
    id: 'r2',
    roundNum: 2,
    scheduledAt: NOW + 3 * 24 * 3600,
    executedAt: null,
    winnerId: null,
    winnerHandle: null,
    payout: null,
    txHash: null,
    defaulters: [],
  },
  {
    id: 'r3',
    roundNum: 3,
    scheduledAt: NOW + 10 * 24 * 3600,
    executedAt: null,
    winnerId: null,
    winnerHandle: null,
    payout: null,
    txHash: null,
    defaulters: [],
  },
  {
    id: 'r4',
    roundNum: 4,
    scheduledAt: NOW + 17 * 24 * 3600,
    executedAt: null,
    winnerId: null,
    winnerHandle: null,
    payout: null,
    txHash: null,
    defaulters: [],
  },
  {
    id: 'r5',
    roundNum: 5,
    scheduledAt: NOW + 24 * 24 * 3600,
    executedAt: null,
    winnerId: null,
    winnerHandle: null,
    payout: null,
    txHash: null,
    defaulters: [],
  },
];

export function getDemoKye(address: string): { kye: ApiKye; members: ApiMember[] } {
  if (address === DEMO_KYE_SECONDARY.contractAddress) {
    return { kye: DEMO_KYE_SECONDARY, members: DEMO_MEMBERS_SECONDARY };
  }
  return { kye: DEMO_KYE_PRIMARY, members: DEMO_MEMBERS_PRIMARY };
}

export function getDemoMe(empty = false): { user: ApiUser; kyes: ApiKye[] } {
  return { user: DEMO_USER, kyes: empty ? [] : DEMO_KYES };
}
