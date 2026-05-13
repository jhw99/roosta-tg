/**
 * Typed client for the Roosta backend HTTP API.
 *
 * Uses a service-token auth header (`X-Service-Token`) so the bot can act
 * on behalf of any Telegram user without minting initData. The backend must
 * honor this header as a bypass for the initData middleware.
 */

export interface BackendUserKyeSummary {
  kyeId: string;
  name: string;
  contractAddress: string;
  status: 'created' | 'active' | 'completed' | 'cancelled';
  orderNum: number | null;
  memberStatus: string | null;
}

export interface BackendMeResponse {
  user: {
    id: string;
    telegramId: number;
    walletAddress: string | null;
    language: string;
  };
  kyes: BackendUserKyeSummary[];
}

export interface BackendKyeParams {
  N: number;
  contribution: string | number;
  roundIntervalSec: number;
  feeRateBps: number;
  alphaMaxBps: number;
  defaultPolicy: string;
}

export interface BackendKyeResponse {
  kye: {
    id: string;
    name: string;
    contractAddress: string;
    organizerId: string;
    organizerTelegramId: number | null;
    organizerHandle: string | null;
    organizerWalletAddress: string | null;
    params: BackendKyeParams;
    status: string;
    createdAt: string;
  };
  members: Array<{ user_id: string; order_num: number; status: string; joined_at: string }>;
  currentRound: unknown;
}

export interface BackendClientOptions {
  baseUrl: string;
  serviceToken?: string;
  fetchImpl?: typeof fetch;
}

export class BackendClient {
  private readonly baseUrl: string;
  private readonly serviceToken: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: BackendClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.serviceToken = opts.serviceToken;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(telegramId?: number): HeadersInit {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.serviceToken) h['x-service-token'] = this.serviceToken;
    if (telegramId !== undefined) h['x-service-telegram-id'] = String(telegramId);
    return h;
  }

  async getMe(telegramId: number): Promise<BackendMeResponse | null> {
    const res = await this.fetchImpl(`${this.baseUrl}/me`, {
      headers: this.headers(telegramId),
    });
    if (!res.ok) return null;
    return (await res.json()) as BackendMeResponse;
  }

  async getKye(contractAddress: string): Promise<BackendKyeResponse | null> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/kyes/${encodeURIComponent(contractAddress)}`,
      { headers: this.headers() },
    );
    if (!res.ok) return null;
    return (await res.json()) as BackendKyeResponse;
  }
}
