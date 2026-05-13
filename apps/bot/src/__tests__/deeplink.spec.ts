import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { createStartCommand, buildInvitePreview } from '../commands/start.js';
import type { BotDeps } from '../deps.js';
import type { BackendClient, BackendKyeResponse } from '../services/backendClient.js';

const TMA = 'https://t.me/roosta_bot/app';
const VALID_ADDR = 'EQ' + 'A'.repeat(46); // 48-char base64url-shaped

function mkDeps(backend: Partial<BackendClient>): BotDeps {
  return {
    logger: pino({ level: 'silent' }),
    backend: backend as BackendClient,
    supabase: null,
    tmaUrl: TMA,
    botUsername: 'roosta_bot',
  };
}

function mkCtx(payload: string) {
  const reply = vi.fn(async () => undefined);
  return {
    reply,
    match: payload,
    from: { id: 42, language_code: 'en', username: 'tester' },
    chat: { id: 42, type: 'private' as const },
  };
}

describe('/start kye_<addr> deeplink', () => {
  it('renders preview card for valid address', async () => {
    const kyeResp: BackendKyeResponse = {
      kye: {
        id: 'k1',
        name: 'Friday Circle',
        contractAddress: VALID_ADDR,
        organizerId: 'u1',
        params: {
          N: 5,
          contribution: '100000000', // 100 USDT minor
          roundIntervalSec: 7 * 86400,
          feeRateBps: 300,
          alphaMaxBps: 500,
          defaultPolicy: 'pro_rata',
        },
        status: 'created',
        createdAt: new Date().toISOString(),
      },
      members: [{ user_id: 'u1', order_num: 1, status: 'active', joined_at: '' }],
      currentRound: null,
    };
    const backend = { getKye: vi.fn(async () => kyeResp) } as unknown as BackendClient;
    const handler = createStartCommand(mkDeps(backend));
    const ctx = mkCtx(`kye_${VALID_ADDR}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(ctx as any);
    expect(ctx.reply).toHaveBeenCalledOnce();
    const [text, opts] = ctx.reply.mock.calls[0]!;
    expect(text).toContain('Friday Circle');
    expect(text).toContain('1 / 5');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((opts as any).reply_markup.inline_keyboard).toHaveLength(2);
  });

  it('rejects invalid address', async () => {
    const backend = { getKye: vi.fn() } as unknown as BackendClient;
    const handler = createStartCommand(mkDeps(backend));
    const ctx = mkCtx('kye_short');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(ctx as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((backend.getKye as any)).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls[0]![0]).toMatch(/invalid/i);
  });

  it('handles non-kye payload as welcome', async () => {
    const backend = { getKye: vi.fn() } as unknown as BackendClient;
    const handler = createStartCommand(mkDeps(backend));
    const ctx = mkCtx('somethingelse');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(ctx as any);
    expect(ctx.reply.mock.calls[0]![0]).toMatch(/Welcome to Roosta/);
  });

  it('shows not_found when backend lookup misses', async () => {
    const backend = { getKye: vi.fn(async () => null) } as unknown as BackendClient;
    const handler = createStartCommand(mkDeps(backend));
    const ctx = mkCtx(`kye_${VALID_ADDR}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(ctx as any);
    expect(ctx.reply.mock.calls[0]![0]).toMatch(/could not be found/i);
  });
});

describe('buildInvitePreview math', () => {
  it('produces both web_app and decline buttons', () => {
    const preview = buildInvitePreview('en', TMA, {
      name: 'X',
      organizerHandle: '@o',
      filled: 2,
      total: 4,
      contributionMinor: 100_000_000n,
      intervalSec: 7 * 86400,
      feeRateBps: 300,
      alphaMaxBps: 500,
      contractAddress: VALID_ADDR,
    });
    expect(preview.keyboard.inline_keyboard).toHaveLength(2);
    const open = preview.keyboard.inline_keyboard[0]![0]!;
    const decline = preview.keyboard.inline_keyboard[1]![0]!;
    expect('web_app' in open).toBe(true);
    expect('callback_data' in decline).toBe(true);
    if ('callback_data' in decline) expect(decline.callback_data).toBe('invite:decline');
  });
});
