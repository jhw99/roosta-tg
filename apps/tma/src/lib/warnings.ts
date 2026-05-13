import type { Strings } from '../i18n';

export interface WarningInput {
  N: number;
  feeBps: number;
  alphaMaxBps: number;
  roundIntervalWeeks: number;
}

export interface WarningItem {
  id: 'highFeeAlpha' | 'highFee' | 'highAlpha' | 'longDuration';
  message: string;
}

/**
 * GSD §2.6 soft-limit warnings.
 * - F + α_max > 20%: slot #1 receives less than 80% of pool
 * - F > 10%: fee well above market avg
 * - α_max > 30%: spread too large
 * - interval × N > 12 months (~52 weeks)
 */
export function computeWarnings(input: WarningInput, s: Strings): WarningItem[] {
  const out: WarningItem[] = [];
  if (input.feeBps + input.alphaMaxBps > 2000) {
    out.push({ id: 'highFeeAlpha', message: s.warnings.highFeeAlpha });
  }
  if (input.feeBps > 1000) {
    out.push({ id: 'highFee', message: s.warnings.highFee });
  }
  if (input.alphaMaxBps > 3000) {
    out.push({ id: 'highAlpha', message: s.warnings.highAlpha });
  }
  if (input.roundIntervalWeeks * input.N > 52) {
    out.push({ id: 'longDuration', message: s.warnings.longDuration });
  }
  return out;
}
