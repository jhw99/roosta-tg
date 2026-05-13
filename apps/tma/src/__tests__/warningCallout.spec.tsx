import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WarningCallout } from '../components/WarningCallout';
import { computeWarnings } from '../lib/warnings';
import { en } from '../i18n/en';

describe('warnings & WarningCallout', () => {
  it('triggers highFeeAlpha when F + alpha > 20%', () => {
    const w = computeWarnings({ N: 10, feeBps: 1500, alphaMaxBps: 600, roundIntervalWeeks: 1 }, en);
    const ids = w.map((x) => x.id);
    expect(ids).toContain('highFeeAlpha');
  });

  it('triggers highFee when F > 10%', () => {
    const w = computeWarnings({ N: 5, feeBps: 1200, alphaMaxBps: 0, roundIntervalWeeks: 1 }, en);
    expect(w.find((x) => x.id === 'highFee')?.message).toBe(en.warnings.highFee);
  });

  it('triggers highAlpha when alpha > 30%', () => {
    const w = computeWarnings({ N: 5, feeBps: 200, alphaMaxBps: 3500, roundIntervalWeeks: 1 }, en);
    expect(w.find((x) => x.id === 'highAlpha')?.message).toBe(en.warnings.highAlpha);
  });

  it('triggers longDuration when interval × N > 52 weeks', () => {
    const w = computeWarnings({ N: 30, feeBps: 200, alphaMaxBps: 0, roundIntervalWeeks: 2 }, en);
    expect(w.find((x) => x.id === 'longDuration')?.message).toBe(en.warnings.longDuration);
  });

  it('renders one row per warning', () => {
    const w = computeWarnings({ N: 30, feeBps: 1500, alphaMaxBps: 3500, roundIntervalWeeks: 2 }, en);
    expect(w.length).toBe(4);
    const { container } = render(<WarningCallout items={w} />);
    expect(container.querySelectorAll('[data-warning]').length).toBe(4);
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<WarningCallout items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
