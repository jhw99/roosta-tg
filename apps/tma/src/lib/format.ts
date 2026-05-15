export const USDC_DECIMALS = 6n;
export const USDC_SCALE = 10n ** USDC_DECIMALS;
// Back-compat aliases — older code paths still import USDT_*.
export const USDT_DECIMALS = USDC_DECIMALS;
export const USDT_SCALE = USDC_SCALE;

export function fmtUSDC(v: bigint, fractionDigits = 2): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / USDC_SCALE;
  const frac = abs % USDC_SCALE;
  const fracStr = frac.toString().padStart(6, '0').slice(0, fractionDigits);
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${wholeStr}${fractionDigits > 0 ? '.' + fracStr : ''}`;
}
export const fmtUSDT = fmtUSDC;

export function shortAddress(addr: string | null | undefined, head = 4, tail = 4): string {
  if (!addr) return '';
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return '00:00:00';
  const s = Math.floor(secondsLeft);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function tonscanAddressUrl(address: string): string {
  return `https://tonscan.org/address/${address}`;
}

export function tonscanTxUrl(hash: string): string {
  return `https://tonscan.org/tx/${hash}`;
}
