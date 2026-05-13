import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { __setSupabase } from '../indexer/supabase.js';
import { me } from '../routes/me.js';
import { kyes } from '../routes/kyes.js';

// ---------- A tiny fake of the supabase-js fluent client ----------

interface Row {
  [k: string]: unknown;
}

type Predicate = (row: Row) => boolean;

class FakeQuery {
  private rows: Row[];
  private filters: Predicate[] = [];
  private orderKey: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private singleMode: 'maybe' | null = null;
  private selectCols: string | null = null;
  private nullFilter: { col: string; isNull: boolean } | null = null;

  constructor(private readonly tableName: string, private readonly store: Map<string, Row[]>) {
    this.rows = store.get(tableName) ?? [];
  }

  select(cols?: string): this {
    this.selectCols = cols ?? '*';
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  gte(col: string, val: unknown): this {
    this.filters.push((r) => (r[col] as string) >= (val as string));
    return this;
  }
  lte(col: string, val: unknown): this {
    this.filters.push((r) => (r[col] as string) <= (val as string));
    return this;
  }
  is(col: string, val: null | unknown): this {
    if (val === null) this.nullFilter = { col, isNull: true };
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderKey = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  maybeSingle(): Promise<{ data: Row | null; error: null }> {
    this.singleMode = 'maybe';
    return this.exec() as Promise<{ data: Row | null; error: null }>;
  }
  then<T>(onF: (v: { data: Row[] | Row | null; error: null }) => T): Promise<T> {
    return this.exec().then(onF);
  }

  insert(row: Row | Row[]): this {
    const rows = Array.isArray(row) ? row : [row];
    const arr = this.store.get(this.tableName) ?? [];
    for (const r of rows) {
      const withId: Row = {
        id:
          (r as { id?: string }).id ?? `${this.tableName}-${arr.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
        ...r,
      };
      arr.push(withId);
    }
    this.store.set(this.tableName, arr);
    this.rows = arr;
    // chainable .select().maybeSingle() should return inserted row
    return this;
  }

  upsert(row: Row | Row[], opts?: { onConflict?: string }): this {
    const rows = Array.isArray(row) ? row : [row];
    const arr = this.store.get(this.tableName) ?? [];
    const conflict = opts?.onConflict?.split(',').map((s) => s.trim()) ?? [];
    for (const r of rows) {
      let replaced = false;
      if (conflict.length > 0) {
        for (let i = 0; i < arr.length; i++) {
          if (conflict.every((k) => arr[i]![k] === r[k])) {
            arr[i] = { ...arr[i]!, ...r };
            replaced = true;
            break;
          }
        }
      }
      if (!replaced) arr.push({ id: `${this.tableName}-u-${arr.length}`, ...r });
    }
    this.store.set(this.tableName, arr);
    this.rows = arr;
    return this;
  }

  update(patch: Row): this {
    const arr = this.store.get(this.tableName) ?? [];
    const matches = this.applyFilters(arr);
    for (const m of matches) Object.assign(m, patch);
    this.rows = arr;
    return this;
  }

  catch(): this {
    return this;
  }

  private applyFilters(rows: Row[]): Row[] {
    let out = rows;
    for (const f of this.filters) out = out.filter(f);
    if (this.nullFilter) {
      out = out.filter((r) =>
        this.nullFilter!.isNull
          ? r[this.nullFilter!.col] === null || r[this.nullFilter!.col] === undefined
          : true,
      );
    }
    return out;
  }

  private async exec(): Promise<{ data: Row[] | Row | null; error: null }> {
    let out = this.applyFilters(this.rows);
    if (this.orderKey) {
      const k = this.orderKey;
      const asc = this.orderAsc;
      out = [...out].sort((a, b) => {
        if ((a[k] as number) < (b[k] as number)) return asc ? -1 : 1;
        if ((a[k] as number) > (b[k] as number)) return asc ? 1 : -1;
        return 0;
      });
    }
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    if (this.singleMode === 'maybe') {
      return { data: (out[0] as Row) ?? null, error: null };
    }
    return { data: out, error: null };
  }
}

class FakeSupabase {
  store = new Map<string, Row[]>();
  from(name: string): FakeQuery {
    return new FakeQuery(name, this.store);
  }
  seed(name: string, rows: Row[]): void {
    this.store.set(name, [...rows]);
  }
  rpc(): Promise<{ data: null; error: null }> {
    return Promise.resolve({ data: null, error: null });
  }
}

function mountApp(): Hono {
  const app = new Hono();
  app.use('*', async (c, next) => {
    // Simulate verified initData with a Telegram user.
    (c as unknown as { set: (k: string, v: unknown) => void }).set('tgUser', {
      user: JSON.stringify({ id: 42, language_code: 'en' }),
    });
    await next();
  });
  app.route('/me', me);
  app.route('/kyes', kyes);
  return app;
}

let fake: FakeSupabase;

beforeEach(() => {
  fake = new FakeSupabase();
  __setSupabase(fake as unknown as never);
});

describe('GET /me', () => {
  it('creates user on first call and returns empty kyes list', async () => {
    const app = mountApp();
    const res = await app.request('/me');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { telegramId: number }; kyes: unknown[] };
    expect(body.user.telegramId).toBe(42);
    expect(Array.isArray(body.kyes)).toBe(true);
  });

  it('returns 401 without telegram user', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as unknown as { set: (k: string, v: unknown) => void }).set('tgUser', null);
      await next();
    });
    app.route('/me', me);
    const res = await app.request('/me');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /me/notification-settings', () => {
  it('400 on invalid body', async () => {
    const app = mountApp();
    const res = await app.request('/me/notification-settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wrong: 'shape' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('invalid_body');
  });

  it('upserts settings', async () => {
    const app = mountApp();
    const res = await app.request('/me/notification-settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings: { round_reminder_1h: true } }),
    });
    expect(res.status).toBe(200);
    const stored = fake.store.get('notification_settings') ?? [];
    expect(stored.length).toBe(1);
    expect(stored[0]!.key).toBe('round_reminder_1h');
  });
});

describe('POST /kyes', () => {
  it('rejects invalid feeRateBps', async () => {
    const app = mountApp();
    const res = await app.request('/kyes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'X',
        memberCount: 5,
        contribution: '1000',
        roundIntervalSec: 7 * 86400,
        feeRateBps: 100, // below 200
        defaultPolicy: 0,
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects bad roundInterval', async () => {
    const app = mountApp();
    const res = await app.request('/kyes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'X',
        memberCount: 5,
        contribution: '1000',
        roundIntervalSec: 3 * 86400,
        feeRateBps: 200,
        defaultPolicy: 0,
      }),
    });
    expect(res.status).toBe(400);
  });

  it('returns predicted address on valid params', async () => {
    fake.seed('users', [
      { id: 'u-self', telegram_id: 42, wallet_address: '0:0000000000000000000000000000000000000000000000000000000000000000', language: 'en' },
    ]);
    const prev = process.env.PLATFORM_TREASURY_ADDRESS;
    process.env.PLATFORM_TREASURY_ADDRESS =
      '0:0000000000000000000000000000000000000000000000000000000000000000';
    const app = mountApp();
    const res = await app.request('/kyes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'My Kye',
        memberCount: 5,
        contribution: '1000',
        roundIntervalSec: 14 * 86400,
        feeRateBps: 250,
        alphaMaxBps: 1000,
        defaultPolicy: 1,
      }),
    });
    if (prev === undefined) delete process.env.PLATFORM_TREASURY_ADDRESS;
    else process.env.PLATFORM_TREASURY_ADDRESS = prev;
    expect(res.status).toBe(200);
    const body = (await res.json()) as { predictedAddress: string; params: { contribution: string } };
    // Tact contract addresses are friendly-form base64; legacy raw "0:hex"
    // form also valid. Just assert non-empty.
    expect(body.predictedAddress.length).toBeGreaterThan(0);
    expect(body.params.contribution).toBe('1000');
  });
});

describe('GET /kyes/:id', () => {
  it('404 when not found', async () => {
    const app = mountApp();
    const res = await app.request('/kyes/EQabc');
    expect(res.status).toBe(404);
  });

  it('returns kye + members + currentRound', async () => {
    fake.seed('kyes', [
      {
        id: 'k1',
        name: 'Demo',
        contract_address: 'EQ1',
        organizer_id: 'u1',
        params: { memberCount: 3 },
        status: 'active',
        created_at: '2026-01-01',
      },
    ]);
    fake.seed('kye_members', [
      { id: 'm1', kye_id: 'k1', user_id: 'u1', order_num: 1, status: 'active' },
      { id: 'm2', kye_id: 'k1', user_id: 'u2', order_num: 2, status: 'active' },
    ]);
    fake.seed('rounds', [
      {
        id: 'r1',
        kye_id: 'k1',
        round_num: 1,
        scheduled_at: '2026-06-01',
        executed_at: null,
        winner_id: null,
        payout: null,
        tx_hash: null,
      },
    ]);
    const app = mountApp();
    const res = await app.request('/kyes/EQ1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kye: { id: string };
      members: unknown[];
      currentRound: { round_num: number } | null;
    };
    expect(body.kye.id).toBe('k1');
    expect(body.members.length).toBe(2);
    expect(body.currentRound?.round_num).toBe(1);
  });
});

describe('POST /kyes/:id/join', () => {
  beforeEach(() => {
    fake.seed('users', [
      { id: 'u-self', telegram_id: 42, wallet_address: 'EQwallet', language: 'en' },
    ]);
    fake.seed('kyes', [
      {
        id: 'k1',
        name: 'Demo',
        contract_address: 'EQ1',
        organizer_id: 'u-organizer',
        params: { memberCount: 5 },
        status: 'created',
        created_at: '2026-01-01',
      },
    ]);
  });

  it('locks an open slot for 60s', async () => {
    const app = mountApp();
    const res = await app.request('/kyes/EQ1/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderNum: 2 }),
    });
    expect(res.status).toBe(200);
    const locks = fake.store.get('pending_joins') ?? [];
    expect(locks.length).toBe(1);
    expect(locks[0]!.order_num).toBe(2);
  });

  it('409 when slot already filled', async () => {
    fake.seed('kye_members', [
      { id: 'm-x', kye_id: 'k1', user_id: 'other', order_num: 2 },
    ]);
    const app = mountApp();
    const res = await app.request('/kyes/EQ1/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderNum: 2 }),
    });
    expect(res.status).toBe(409);
  });

  it('403 when caller is the organizer', async () => {
    // Update self user to be the organizer.
    fake.seed('users', [
      { id: 'u-organizer', telegram_id: 42, wallet_address: 'EQwallet', language: 'en' },
    ]);
    const app = mountApp();
    const res = await app.request('/kyes/EQ1/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderNum: 2 }),
    });
    expect(res.status).toBe(403);
  });
});
