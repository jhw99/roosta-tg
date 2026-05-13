import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { createLinkKyeCommand } from '../commands/linkkye.js';
import type { BotDeps } from '../deps.js';

/**
 * Builds a fake supabase client that returns scripted rows for `.from(...)`.
 * Each table has its own scripted result.
 */
function mkSupabase(scripts: {
  kyes?: { id: string; name: string; contract_address: string; organizer_id: string } | null;
  user?: { id: string; telegram_id: number; language: string; wallet_address: null; referred_by: null } | null;
  upsertError?: { message: string } | null;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from: (table: string) => {
      if (table === 'kyes') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: scripts.kyes ?? null }) }),
          }),
        };
      }
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: scripts.user ?? null }) }),
          }),
        };
      }
      if (table === 'kye_groups') {
        return {
          upsert: async () => ({ error: scripts.upsertError ?? null }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function mkDeps(sb: ReturnType<typeof mkSupabase>): BotDeps {
  return {
    logger: pino({ level: 'silent' }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    backend: {} as any,
    supabase: sb,
    tmaUrl: 'https://x',
    botUsername: 'roosta_bot',
  };
}

function mkCtx(text: string, fromId: number) {
  return {
    reply: vi.fn(async () => undefined),
    match: text,
    from: { id: fromId, language_code: 'en' },
    chat: { id: -100123, type: 'supergroup' as const },
  };
}

describe('/linkkye access control', () => {
  const kyeRow = { id: 'kye-1', name: 'Demo', contract_address: 'EQ' + 'A'.repeat(46), organizer_id: 'user-org' };

  it('allows the organizer', async () => {
    const sb = mkSupabase({
      kyes: kyeRow,
      user: { id: 'user-org', telegram_id: 1, language: 'en', wallet_address: null, referred_by: null },
    });
    const handler = createLinkKyeCommand(mkDeps(sb));
    const ctx = mkCtx(kyeRow.contract_address, 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(ctx as any);
    expect(ctx.reply.mock.calls[0]![0]).toContain('Demo');
  });

  it('rejects non-organizer', async () => {
    const sb = mkSupabase({
      kyes: kyeRow,
      user: { id: 'user-other', telegram_id: 2, language: 'en', wallet_address: null, referred_by: null },
    });
    const handler = createLinkKyeCommand(mkDeps(sb));
    const ctx = mkCtx(kyeRow.contract_address, 2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(ctx as any);
    expect(ctx.reply.mock.calls[0]![0]).toMatch(/only the kye organizer/i);
  });

  it('rejects in private chat', async () => {
    const sb = mkSupabase({ kyes: kyeRow, user: null });
    const handler = createLinkKyeCommand(mkDeps(sb));
    const ctx = {
      reply: vi.fn(async () => undefined),
      match: kyeRow.contract_address,
      from: { id: 1, language_code: 'en' },
      chat: { id: 1, type: 'private' as const },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(ctx as any);
    expect(ctx.reply.mock.calls[0]![0]).toMatch(/only works inside a group/i);
  });

  it('rejects missing argument', async () => {
    const sb = mkSupabase({ kyes: kyeRow });
    const handler = createLinkKyeCommand(mkDeps(sb));
    const ctx = mkCtx('', 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(ctx as any);
    expect(ctx.reply.mock.calls[0]![0]).toMatch(/Usage:/);
  });
});
