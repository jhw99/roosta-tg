/**
 * Payout math — integer / basis-point arithmetic.
 *
 * Mirrors GSD Appendix 12.1. All amounts are in smallest units
 * (USDT minor units = 6 decimals). All rates are in basis points (1% = 100 bps).
 *
 * Zero-sum invariant: sum over k=1..N of adjustment(k) === 0 (exact when (N-1) divides
 * the symmetric sum; we use the Python-style floor division to match contract semantics).
 */

export interface PayoutParams {
  /** Member count N, 2..30 (1 is degenerate but supported) */
  N: number;
  /** Contribution per member, in smallest units */
  C: bigint;
  /** Total fee rate in basis points (>= 200) */
  F_bps: number;
  /** Max time adjustment in basis points (>= 0) */
  alpha_max_bps: number;
  /** 1-indexed payout slot, 1..N */
  k: number;
}

export interface PayoutResult {
  pool: bigint;
  fee: bigint;
  platform_fee: bigint;
  organizer_fee: bigint;
  net_pool: bigint;
  adjustment_bps: number;
  payout: bigint;
}

const PLATFORM_FEE_BPS = 50n; // 0.5%
const BPS_DENOM = 10000n;

/** Floor division for signed bigint (Python-style). */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  // If remainder is non-zero and signs differ, floor towards -inf.
  if (r !== 0n && ((r < 0n) !== (b < 0n))) {
    return q - 1n;
  }
  return q;
}

export function calculate_payout(params: PayoutParams): PayoutResult {
  const { N, C, F_bps, alpha_max_bps, k } = params;
  if (!Number.isInteger(N) || N < 1) throw new Error('N must be a positive integer');
  if (!Number.isInteger(k) || k < 1 || k > N) throw new Error('k out of range');
  if (C < 0n) throw new Error('C must be non-negative');
  if (F_bps < 0) throw new Error('F_bps must be non-negative');
  if (alpha_max_bps < 0) throw new Error('alpha_max_bps must be non-negative');

  const nBig = BigInt(N);
  const pool = nBig * C;
  const fee = (pool * BigInt(F_bps)) / BPS_DENOM;
  const platform_fee = (pool * PLATFORM_FEE_BPS) / BPS_DENOM;
  const organizer_fee = fee - platform_fee;
  const net_pool = pool - fee;

  let adj_bps: bigint;
  if (N === 1) {
    adj_bps = 0n;
  } else {
    const numerator = BigInt(2 * k - N - 1) * BigInt(alpha_max_bps);
    adj_bps = floorDiv(numerator, BigInt(N - 1));
  }

  const payout = floorDiv(net_pool * (BPS_DENOM + adj_bps), BPS_DENOM);

  return {
    pool,
    fee,
    platform_fee,
    organizer_fee,
    net_pool,
    adjustment_bps: Number(adj_bps),
    payout,
  };
}
