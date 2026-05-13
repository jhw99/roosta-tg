import { describe, expect, it } from 'vitest';
import { calculate_payout } from './payout.js';

const C = 100_000_000n; // 100 USDT in 6-decimal minor units

describe('calculate_payout', () => {
  it('N=2 with F=2%, alpha=0 splits pool with platform/organizer fees', () => {
    const r1 = calculate_payout({ N: 2, C, F_bps: 200, alpha_max_bps: 0, k: 1 });
    expect(r1.pool).toBe(200_000_000n);
    expect(r1.fee).toBe(4_000_000n); // 2%
    expect(r1.platform_fee).toBe(1_000_000n); // 0.5%
    expect(r1.organizer_fee).toBe(3_000_000n);
    expect(r1.net_pool).toBe(196_000_000n);
    expect(r1.payout).toBe(196_000_000n); // alpha=0
    expect(r1.adjustment_bps).toBe(0);
  });

  it('N=30 with alpha=0 yields equal payout for every k', () => {
    const F_bps = 200;
    let totalPayout = 0n;
    for (let k = 1; k <= 30; k++) {
      const r = calculate_payout({ N: 30, C, F_bps, alpha_max_bps: 0, k });
      expect(r.payout).toBe(r.net_pool);
      totalPayout += r.payout;
    }
    // 30 rounds * net_pool
    const oneRound = calculate_payout({ N: 30, C, F_bps, alpha_max_bps: 0, k: 1 });
    expect(totalPayout).toBe(oneRound.net_pool * 30n);
  });

  it('alpha endpoints: k=1 gets -alpha_max, k=N gets +alpha_max', () => {
    const r1 = calculate_payout({ N: 10, C, F_bps: 200, alpha_max_bps: 1000, k: 1 });
    const rN = calculate_payout({ N: 10, C, F_bps: 200, alpha_max_bps: 1000, k: 10 });
    expect(r1.adjustment_bps).toBe(-1000);
    expect(rN.adjustment_bps).toBe(1000);
  });

  it('zero-sum invariant: sum of adjustments is ~0 across all k (N odd, exact divisibility)', () => {
    // N=11 -> denominator 10, numerator (2k - 12) * alpha. With alpha 1000, each term divisible by 10.
    let sum = 0;
    for (let k = 1; k <= 11; k++) {
      const r = calculate_payout({ N: 11, C, F_bps: 200, alpha_max_bps: 1000, k });
      sum += r.adjustment_bps;
    }
    expect(sum).toBe(0);
  });

  it('rejects invalid k', () => {
    expect(() => calculate_payout({ N: 5, C, F_bps: 200, alpha_max_bps: 0, k: 0 })).toThrow();
    expect(() => calculate_payout({ N: 5, C, F_bps: 200, alpha_max_bps: 0, k: 6 })).toThrow();
  });

  it('matches GSD Python reference for N=5,C=100,F=2%,alpha=10%,k=3 (mid)', () => {
    const r = calculate_payout({ N: 5, C, F_bps: 200, alpha_max_bps: 1000, k: 3 });
    expect(r.adjustment_bps).toBe(0);
    expect(r.payout).toBe(r.net_pool);
  });
});
