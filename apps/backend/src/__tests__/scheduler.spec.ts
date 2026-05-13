import { describe, it, expect, vi } from 'vitest';
import { RoundScheduler } from '../scheduler/scheduler.js';

function makeFakeSupabase(rounds: unknown[]): {
  from: (t: string) => { select: () => { lte: () => { is: () => Promise<{ data: unknown[]; error: null }> } } };
} {
  return {
    from(_t: string) {
      return {
        select() {
          return {
            lte() {
              return {
                is() {
                  return Promise.resolve({ data: rounds, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('RoundScheduler', () => {
  it('enqueues only active kyes with due rounds', async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const sb = makeFakeSupabase([
      {
        id: 'r1',
        kye_id: 'k1',
        round_num: 1,
        scheduled_at: '2020-01-01',
        kyes: { contract_address: 'EQ1', status: 'active' },
      },
      {
        id: 'r2',
        kye_id: 'k2',
        round_num: 1,
        scheduled_at: '2020-01-01',
        kyes: { contract_address: 'EQ2', status: 'created' },
      },
    ]);
    const scheduler = new RoundScheduler({
      supabase: sb as never,
      queue: queue as never,
    });
    const count = await scheduler.tick();
    expect(count).toBe(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
    const call = queue.add.mock.calls[0]!;
    expect(call[0]).toBe('execute_round');
    expect(call[1]).toMatchObject({ roundId: 'r1', contractAddress: 'EQ1' });
    expect(call[2]).toMatchObject({ jobId: 'execute_round:r1', attempts: 3 });
  });

  it('returns 0 when no rounds due', async () => {
    const queue = { add: vi.fn() };
    const sb = makeFakeSupabase([]);
    const scheduler = new RoundScheduler({
      supabase: sb as never,
      queue: queue as never,
    });
    const count = await scheduler.tick();
    expect(count).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });
});
