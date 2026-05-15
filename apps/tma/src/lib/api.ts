import { z } from 'zod';
import { getInitData } from './webapp';
import {
  isDemoMode,
  getDemoMe,
  getDemoKye,
  DEMO_ROUNDS,
  DEMO_KYE_PRIMARY,
} from './demo';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

function friendlyMessage(method: string, path: string, status: number, body: unknown): string {
  // Server-provided error message wins when available.
  if (body && typeof body === 'object' && 'error' in body) {
    const msg = (body as { error?: unknown }).error;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  if (status === 401 || status === 403) {
    // GET on a circle = invite link opened outside Telegram. Writes = stale session.
    if (method === 'GET') {
      return '이 링크는 텔레그램의 Roosta 미니앱에서 열어주세요.';
    }
    return '세션이 만료됐어요. 미니앱을 다시 열어주세요.';
  }
  if (status === 404) return '요청한 항목을 찾을 수 없어요.';
  if (status === 409) return '이미 처리된 요청이에요.';
  if (status === 429) return '요청이 너무 잦아요. 잠시 후 다시 시도해주세요.';
  if (status >= 500) return '서버에 일시적인 문제가 있어요. 잠시 후 다시 시도해주세요.';
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Max retries on 5xx (default 3) */
  retries?: number;
  /** Base backoff in ms (default 200) */
  backoffMs?: number;
  /** Override fetch (for tests) */
  fetchImpl?: typeof fetch;
  /** Override init data getter (for tests) */
  getInitDataImpl?: () => string;
  signal?: AbortSignal;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  opts: RequestOptions = {},
): Promise<T> {
  const method = opts.method ?? 'GET';
  const retries = opts.retries ?? 3;
  const backoffMs = opts.backoffMs ?? 200;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const initDataGetter = opts.getInitDataImpl ?? getInitData;

  const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const initData = initDataGetter();

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-telegram-init-data': initData,
    ...(opts.headers ?? {}),
  };

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method,
        headers,
        body: opts.body == null ? undefined : JSON.stringify(opts.body),
        signal: opts.signal,
      });

      if (res.status >= 500 && attempt < retries) {
        await sleep(backoffMs * 2 ** attempt);
        continue;
      }

      const text = await res.text();
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!res.ok) {
        throw new ApiError(friendlyMessage(method, path, res.status, data), res.status, data);
      }

      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        throw new ApiError(`Invalid response shape from ${path}`, res.status, parsed.error.format());
      }
      return parsed.data;
    } catch (err) {
      lastErr = err;
      if (err instanceof ApiError && err.status < 500) throw err;
      if (attempt >= retries) throw err;
      await sleep(backoffMs * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Unknown API error');
}

/* ----- Schemas ----- */

export const userSchema = z.object({
  id: z.string(),
  telegramId: z.union([z.string(), z.number()]),
  walletAddress: z.string().nullable(),
  language: z.enum(['ko', 'en']).optional(),
  createdAt: z.number().optional(),
  vaultAddress: z.string().nullable().optional(),
  sessionPubkey: z.string().nullable().optional(),
  faucetClaimedAt: z.string().nullable().optional(),
  // Server-tracked test USDC balance in nano units (testnet). Displayed as
  // USDC at 6 dec. Real on-chain TON in the wallet is ignored on purpose.
  testUsdcBalance: z.string().optional(),
});
export type ApiUser = z.infer<typeof userSchema>;

export const kyeParamsSchema = z.object({
  N: z.number().int(),
  contribution: z.string(), // bigint as string (smallest units)
  roundIntervalSec: z.number().int(),
  feeRateBps: z.number().int(),
  alphaMaxBps: z.number().int(),
  defaultPolicy: z.enum(['pro_rata', 'cancel', 'organizer_cover']),
});

export const kyeSchema = z.object({
  id: z.string(),
  contractAddress: z.string(),
  organizerId: z.string(),
  organizerHandle: z.string().nullable().optional(),
  organizerWallet: z.string().nullable().optional(),
  organizerTelegramId: z.number().nullable().optional(),
  organizerWalletAddress: z.string().nullable().optional(),
  name: z.string(),
  params: kyeParamsSchema,
  status: z.enum(['created', 'active', 'completed', 'cancelled']),
  memberCount: z.number().int().nonnegative(),
  currentRound: z.number().int().nonnegative(),
  nextRoundAt: z.number().nullable().optional(),
  createdAt: z.number(),
});
export type ApiKye = z.infer<typeof kyeSchema>;

export const memberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  handle: z.string().nullable().optional(),
  walletAddress: z.string(),
  orderNum: z.number().int().nonnegative(),
  status: z.enum(['active', 'defaulted', 'paid_out']),
  currentRoundStatus: z.enum(['paid', 'pending', 'defaulted']).optional(),
  isMe: z.boolean().optional(),
});
export type ApiMember = z.infer<typeof memberSchema>;

export const roundSchema = z.object({
  id: z.string(),
  roundNum: z.number().int(),
  scheduledAt: z.number(),
  executedAt: z.number().nullable(),
  winnerId: z.string().nullable(),
  winnerHandle: z.string().nullable().optional(),
  payout: z.string().nullable(),
  txHash: z.string().nullable(),
  defaulters: z.array(z.string()).optional(),
});
export type ApiRound = z.infer<typeof roundSchema>;

export const meResponseSchema = z.object({
  user: userSchema,
  kyes: z.array(kyeSchema),
});

export const kyeDetailSchema = z.object({
  kye: kyeSchema,
  members: z.array(memberSchema),
});

export const roundsResponseSchema = z.object({
  rounds: z.array(roundSchema),
});

export const createKyeResponseSchema = z.object({
  predictedAddress: z.string(),
  inviteLink: z.string().optional(),
  params: z.unknown().optional(),
});

export const joinKyeResponseSchema = z.object({
  ok: z.boolean().optional(),
  kyeId: z.string().optional(),
  orderNum: z.number().int().optional(),
  reservationId: z.string().optional(),
  expiresAt: z.union([z.string(), z.number()]).optional(),
});

export const notificationSettingsSchema = z.object({
  reminder24h: z.boolean(),
  reminder1h: z.boolean(),
  roundResult: z.boolean(),
  organizerDefaultAlert: z.boolean(),
  groupWinner: z.boolean(),
  language: z.enum(['ko', 'en']).optional(),
});
export type ApiNotificationSettings = z.infer<typeof notificationSettingsSchema>;

/* ----- Client convenience ----- */

function demoEmptyRequested(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.search.includes('seed=empty');
}

export const api = {
  me: async () => {
    if (isDemoMode()) return getDemoMe(demoEmptyRequested());
    return apiRequest('/me', meResponseSchema);
  },
  saveWallet: async (walletAddress: string) => {
    if (isDemoMode()) return { ok: true, walletAddress };
    return apiRequest(
      '/me/wallet',
      z.object({ ok: z.boolean(), walletAddress: z.string() }),
      { method: 'PATCH', body: { walletAddress } },
    );
  },
  kye: async (address: string) => {
    if (isDemoMode()) return getDemoKye(address);
    return apiRequest(`/kyes/${address}`, kyeDetailSchema);
  },
  rounds: async (_address: string) => {
    if (isDemoMode()) return { rounds: DEMO_ROUNDS };
    return apiRequest(`/kyes/${_address}/rounds`, roundsResponseSchema);
  },
  createKye: async (body: unknown) => {
    if (isDemoMode()) {
      return {
        predictedAddress: DEMO_KYE_PRIMARY.contractAddress,
        inviteLink: `https://t.me/RoostaBot/app?startapp=join_${DEMO_KYE_PRIMARY.contractAddress}`,
      };
    }
    return apiRequest('/kyes', createKyeResponseSchema, { method: 'POST', body });
  },
  joinKye: async (address: string, body: unknown) => {
    if (isDemoMode()) {
      return { reservationId: 'demo-reservation', expiresAt: Math.floor(Date.now() / 1000) + 300 };
    }
    return apiRequest(`/kyes/${address}/join`, joinKyeResponseSchema, { method: 'POST', body });
  },
  updateNotificationSettings: (body: Partial<ApiNotificationSettings>) =>
    apiRequest('/me/notification-settings', notificationSettingsSchema, {
      method: 'PATCH',
      body,
    }),

  // Testnet-only: claim 1000 USDC (= 1 TON) drop to the connected wallet.
  faucet: async () =>
    apiRequest(
      '/me/faucet',
      z.object({ ok: z.boolean(), amount: z.string(), testUsdcBalance: z.string().optional() }),
      { method: 'POST' },
    ),

  // --- Gasless vault ---
  saveVault: async (sessionPubkey: string, vaultAddress: string) => {
    if (isDemoMode()) return { ok: true, vaultAddress };
    return apiRequest(
      '/me/vault',
      z.object({ ok: z.boolean(), vaultAddress: z.string() }),
      { method: 'PATCH', body: { sessionPubkey, vaultAddress } },
    );
  },
  vaultState: async (vaultAddress: string) => {
    if (isDemoMode()) {
      return { deployed: true, seqno: '0', balance: '5000000000', pubKey: '00'.repeat(32) };
    }
    return apiRequest(
      `/relay/state?vault=${encodeURIComponent(vaultAddress)}`,
      z.object({
        deployed: z.boolean(),
        seqno: z.string(),
        balance: z.string(),
        pubKey: z.string(),
      }),
    );
  },
  relay: async (body: {
    vaultAddress: string;
    intent: {
      seqno: string;
      validUntil: string;
      target: string;
      amount: string;
      mode: number;
      body: string;
    };
    signature: string;
  }) => {
    if (isDemoMode()) return { ok: true, intentSeqno: body.intent.seqno, walletSeqno: 0 };
    return apiRequest(
      '/relay',
      z.object({
        ok: z.boolean(),
        intentSeqno: z.string(),
        walletSeqno: z.number(),
      }),
      { method: 'POST', body },
    );
  },
};
