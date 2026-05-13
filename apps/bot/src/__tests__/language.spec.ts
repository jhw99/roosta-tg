import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { createLangCallback, buildLangPrompt } from '../commands/lang.js';
import type { BotDeps } from '../deps.js';

function mkSupabase(captured: { rows: Array<{ telegram_id: number; language: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from: (table: string) => {
      if (table !== 'users') throw new Error('unexpected table');
      return {
        upsert: async (row: { telegram_id: number; language: string }) => {
          captured.rows.push(row);
          return { error: null };
        },
      };
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

describe('/lang', () => {
  it('persists ko on lang:ko', async () => {
    const captured = { rows: [] as Array<{ telegram_id: number; language: string }> };
    const handler = createLangCallback(mkDeps(mkSupabase(captured)));
    const ctx = {
      callbackQuery: { data: 'lang:ko' },
      from: { id: 99, language_code: 'en' },
      answerCallbackQuery: vi.fn(async () => undefined),
      reply: vi.fn(async () => undefined),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(ctx as any);
    expect(captured.rows).toEqual([{ telegram_id: 99, language: 'ko' }]);
    expect(ctx.reply.mock.calls[0]![0]).toMatch(/한국어/);
  });

  it('persists en on lang:en', async () => {
    const captured = { rows: [] as Array<{ telegram_id: number; language: string }> };
    const handler = createLangCallback(mkDeps(mkSupabase(captured)));
    const ctx = {
      callbackQuery: { data: 'lang:en' },
      from: { id: 7, language_code: 'ko' },
      answerCallbackQuery: vi.fn(async () => undefined),
      reply: vi.fn(async () => undefined),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler(ctx as any);
    expect(captured.rows).toEqual([{ telegram_id: 7, language: 'en' }]);
    expect(ctx.reply.mock.calls[0]![0]).toMatch(/updated to English/);
  });

  it('lang prompt is i18n-resolved', () => {
    expect(buildLangPrompt('ko').text).toContain('언어');
    expect(buildLangPrompt('en').text).toContain('Choose your language');
  });
});
