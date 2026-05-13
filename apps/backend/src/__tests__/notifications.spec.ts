import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderTemplate, settingDefault, settingKeyFor } from '../notifications/templates.js';
import { NotificationDispatcher } from '../notifications/worker.js';
import { __setFetch } from '../notifications/botApi.js';

// ---------------- templates ----------------

describe('templates', () => {
  it('renders kye_created in en and ko', () => {
    const en = renderTemplate('kye_created', 'en', { name: 'Demo', memberCount: 5, kyeId: 'k1' }, 'https://t.me');
    const ko = renderTemplate('kye_created', 'ko', { name: 'Demo', memberCount: 5, kyeId: 'k1' }, 'https://t.me');
    expect(en?.text).toContain('Your Kye is ready');
    expect(ko?.text).toContain('계가 생성되었습니다');
    expect(en!.buttons[0]![0]!.text).toBe('Open Kye');
    expect(ko!.buttons[0]![0]!.text).toBe('계 열기');
  });

  it('renders round_executed in both locales', () => {
    const payload = { roundNum: 2, winner: 'EQwin', payout: '5000', kyeId: 'k1', nextRoundAt: 't' };
    const en = renderTemplate('round_executed', 'en', payload);
    const ko = renderTemplate('round_executed', 'ko', payload);
    expect(en?.text).toContain('Round #2 executed');
    expect(ko?.text).toContain('2라운드 실행 완료');
  });

  it('renders payout_received with tonscan button', () => {
    const en = renderTemplate('payout_received', 'en', { amount: '100', txHash: 'abc', kyeId: 'k1' });
    expect(en?.text).toContain('You received your payout');
    expect(en?.buttons.flat().some((b) => b.url?.includes('tonscan.org/tx/abc'))).toBe(true);
  });

  it('settingKeyFor returns expected keys / nulls', () => {
    expect(settingKeyFor('round_reminder_1h')).toBe('round_reminder_1h');
    expect(settingKeyFor('kye_created')).toBeNull();
  });

  it('settingDefault: 1h reminder default OFF, everything else ON', () => {
    expect(settingDefault('round_reminder_1h')).toBe(false);
    expect(settingDefault('round_reminder_24h')).toBe(true);
  });
});

// ---------------- worker dispatch ----------------

interface CallLog {
  url: string;
  body: Record<string, unknown>;
}

let calls: CallLog[];
function installFetch(handler: (body: Record<string, unknown>) => { ok: boolean; status: number; json: unknown }): void {
  __setFetch(async (url, init) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, body });
    const res = handler(body);
    return {
      ok: res.ok,
      status: res.status,
      json: async () => res.json,
    };
  });
}

beforeEach(() => {
  calls = [];
});

function makeFakeSupabase(opts: {
  user?: { id: string; telegram_id: number; language: string } | null;
  setting?: boolean | null;
  group?: { chat_id: number } | null;
  members?: Array<{ telegram_id: number }>;
}) {
  return {
    from(table: string) {
      const exec = async () => {
        if (table === 'users') return { data: opts.user ?? null, error: null };
        if (table === 'notification_settings')
          return {
            data: opts.setting === undefined ? null : opts.setting === null ? null : { value: opts.setting },
            error: null,
          };
        if (table === 'kye_groups') return { data: opts.group ?? null, error: null };
        if (table === 'kye_members') {
          return {
            data: (opts.members ?? []).map((m) => ({ user_id: 'x', users: { telegram_id: m.telegram_id } })),
            error: null,
          };
        }
        return { data: null, error: null };
      };
      const builder: Record<string, unknown> = {};
      const proxy = new Proxy(builder, {
        get(_t, prop) {
          if (prop === 'maybeSingle' || prop === 'then') {
            return prop === 'maybeSingle'
              ? () => exec()
              : (resolve: (v: unknown) => unknown) => exec().then(resolve);
          }
          return () => proxy;
        },
      });
      return proxy;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

describe('NotificationDispatcher', () => {
  it('skips when setting is OFF', async () => {
    installFetch(() => ({ ok: true, status: 200, json: { ok: true, result: { message_id: 1 } } }));
    const sb = makeFakeSupabase({
      user: { id: 'u1', telegram_id: 100, language: 'en' },
      setting: false,
    });
    const d = new NotificationDispatcher({ supabase: sb as never, botToken: 'TOKEN' });
    const res = await d.process({
      recipientUserId: 'u1',
      eventType: 'round_reminder_1h',
      channel: 'dm',
      payload: {},
    });
    expect(res.kind).toBe('skipped');
    expect(calls.length).toBe(0);
  });

  it('sends DM with rendered template', async () => {
    installFetch(() => ({ ok: true, status: 200, json: { ok: true, result: { message_id: 7 } } }));
    const sb = makeFakeSupabase({
      user: { id: 'u1', telegram_id: 100, language: 'ko' },
    });
    const d = new NotificationDispatcher({ supabase: sb as never, botToken: 'TOKEN' });
    const res = await d.process({
      recipientUserId: 'u1',
      eventType: 'kye_created',
      channel: 'dm',
      payload: { name: 'Demo', memberCount: 5, kyeId: 'k1' },
    });
    expect(res.kind).toBe('sent');
    expect(calls.length).toBe(1);
    expect(calls[0]!.body.chat_id).toBe(100);
    expect(String(calls[0]!.body.text)).toContain('계가 생성되었습니다');
  });

  it('group channel falls back to DM members when no group registered', async () => {
    installFetch(() => ({ ok: true, status: 200, json: { ok: true, result: { message_id: 7 } } }));
    const sb = makeFakeSupabase({
      user: { id: 'u1', telegram_id: 100, language: 'en' },
      group: null,
      members: [{ telegram_id: 200 }, { telegram_id: 300 }],
    });
    const d = new NotificationDispatcher({ supabase: sb as never, botToken: 'TOKEN' });
    const res = await d.process({
      recipientUserId: 'u1',
      eventType: 'kye_activated',
      channel: 'group',
      payload: { kyeId: 'k1', firstRoundAt: 'soon' },
      kyeId: 'k1',
    });
    expect(res.kind).toBe('sent');
    expect(calls.map((c) => c.body.chat_id).sort()).toEqual([200, 300]);
  });

  it('group with registered chat sends to single chat', async () => {
    installFetch(() => ({ ok: true, status: 200, json: { ok: true, result: { message_id: 7 } } }));
    const sb = makeFakeSupabase({
      user: { id: 'u1', telegram_id: 100, language: 'en' },
      group: { chat_id: -1001234 },
    });
    const d = new NotificationDispatcher({ supabase: sb as never, botToken: 'TOKEN' });
    const res = await d.process({
      recipientUserId: 'u1',
      eventType: 'round_executed',
      channel: 'group',
      payload: { roundNum: 1, winner: 'EQw', payout: '100', kyeId: 'k1' },
      kyeId: 'k1',
    });
    expect(res.kind).toBe('sent');
    expect(calls.length).toBe(1);
    expect(calls[0]!.body.chat_id).toBe(-1001234);
  });

  it('handles 429 rate-limit by returning rate_limited result', async () => {
    installFetch(() => ({
      ok: false,
      status: 429,
      json: { ok: false, parameters: { retry_after: 5 } },
    }));
    const sb = makeFakeSupabase({
      user: { id: 'u1', telegram_id: 100, language: 'en' },
    });
    const d = new NotificationDispatcher({ supabase: sb as never, botToken: 'TOKEN' });
    const res = await d.process({
      recipientUserId: 'u1',
      eventType: 'kye_created',
      channel: 'dm',
      payload: { name: 'X', memberCount: 5, kyeId: 'k1' },
    });
    expect(res.kind).toBe('rate_limited');
    if (res.kind === 'rate_limited') expect(res.retryAfter).toBe(5);
  });
});
