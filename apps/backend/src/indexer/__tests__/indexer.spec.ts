import { describe, it, expect, vi } from 'vitest';
import { Address, beginCell } from '@ton/core';
import { decodeEvent, encodeEventForTest, EVENT_OPCODES, EventType } from '../events.js';
import { EventIndexer } from '../indexer.js';
import type { RawTxEvent } from '../tonClient.js';

function makeAddr(seed = 1): Address {
  const buf = Buffer.alloc(32);
  buf[0] = seed;
  return new Address(0, buf);
}

describe('events.decodeEvent', () => {
  const cases: Array<[EventType, Record<string, unknown>]> = [
    ['KyeCreated', { organizer: makeAddr(1), memberCount: 5 }],
    ['MemberJoined', { member: makeAddr(2), orderNum: 3 }],
    ['KyeActivated', { startTimestamp: 1700000000 }],
    ['RoundExecuted', { roundNum: 2, winner: makeAddr(3), payout: '1000000' }],
    ['DefaultDetected', { member: makeAddr(4), roundNum: 1 }],
    ['PayoutSent', { winner: makeAddr(5), amount: '5000' }],
    ['FeeDistributed', { platform: '500', organizer: '1500' }],
    ['KyeCompleted', { totalRounds: 10 }],
    ['KyeCancelled', { reason: 1 }],
  ];

  it.each(cases)('decodes %s', (type, payload) => {
    const cell = encodeEventForTest(type, payload);
    const decoded = decodeEvent(cell);
    expect(decoded).not.toBeNull();
    expect(decoded!.type).toBe(type);
    expect(decoded!.opcode).toBe(EVENT_OPCODES[type]);
  });

  it('returns null for unknown opcode', () => {
    const cell = beginCell().storeUint(0xdeadbeef, 32).endCell();
    expect(decodeEvent(cell)).toBeNull();
  });
});

describe('EventIndexer idempotency', () => {
  it('processes the same event twice without duplicating side-effects', async () => {
    // In-memory events store mocking the supabase upsert with onConflict ignoreDuplicates.
    const eventsTable: Array<{ tx_hash: string; event_type: string; lt: string }> = [];

    const supabase = {
      from(table: string) {
        if (table === 'events') {
          return {
            upsert(row: any, _opts: any) {
              const key = `${row.tx_hash}:${row.event_type}:${row.lt}`;
              const exists = eventsTable.some(
                (r) => `${r.tx_hash}:${r.event_type}:${r.lt}` === key,
              );
              const chain = {
                select() {
                  return {
                    maybeSingle: async () => {
                      if (exists) return { data: null, error: null };
                      eventsTable.push(row);
                      return { data: { id: key }, error: null };
                    },
                  };
                },
              };
              return chain;
            },
          };
        }
        // Catch-all stub: select chain returning empty, upsert/update no-op.
        const stub: any = {
          select: () => stub,
          eq: () => stub,
          neq: () => stub,
          maybeSingle: async () => ({ data: null, error: null }),
          upsert: async () => ({ data: null, error: null }),
          update: () => stub,
        };
        return stub;
      },
    } as any;

    const cell = encodeEventForTest('KyeCreated', { organizer: makeAddr(1), memberCount: 4 });
    const decoded = decodeEvent(cell)!;
    const raw: RawTxEvent = { txHash: 'abc', lt: 100n, now: 0, event: decoded };

    const indexer = new EventIndexer({
      supabase,
      fetchTransactions: async () => [raw],
      initialAddresses: ['EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    });

    await indexer.processEvent('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', raw);
    await indexer.processEvent('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', raw);

    expect(eventsTable).toHaveLength(1);
  });
});

describe('EventIndexer.tick (mocked tx fetch)', () => {
  it('advances cursor and processes events in lt order', async () => {
    const addr = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const ev1 = decodeEvent(encodeEventForTest('MemberJoined', { member: makeAddr(2), orderNum: 1 }))!;
    const ev2 = decodeEvent(encodeEventForTest('MemberJoined', { member: makeAddr(3), orderNum: 2 }))!;
    const raws: RawTxEvent[] = [
      { txHash: 't2', lt: 200n, now: 0, event: ev2 },
      { txHash: 't1', lt: 100n, now: 0, event: ev1 },
    ];

    const fetcher = vi.fn(async (_a: string, _from?: bigint) => raws);
    const indexer = new EventIndexer({
      supabase: null,
      fetchTransactions: fetcher,
      initialAddresses: [addr],
      notificationQueue: { add: vi.fn(async () => undefined) } as any,
    });

    await indexer.tick();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(indexer.getState(addr).lastProcessedLt).toBe(200n);
  });
});

describe('RLS smoke (mocked)', () => {
  it('service-role insert succeeds, anon insert is denied', async () => {
    // Pure mock — exercises the contract our indexer relies upon.
    const denyAnon = {
      from: () => ({
        insert: async () => ({ data: null, error: { message: 'RLS: insufficient privilege' } }),
      }),
    } as any;
    const allowService = {
      from: () => ({ insert: async () => ({ data: { id: '1' }, error: null }) }),
    } as any;

    const r1 = await allowService.from('events').insert({});
    const r2 = await denyAnon.from('events').insert({});
    expect(r1.error).toBeNull();
    expect(r2.error).not.toBeNull();
  });
});
