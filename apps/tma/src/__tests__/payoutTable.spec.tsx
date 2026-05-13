import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PayoutTable } from '../components/PayoutTable';
import { USDT_SCALE } from '../lib/format';

describe('PayoutTable', () => {
  it('renders N rows for N=10 and slot 1 < slot 10 with positive alpha', () => {
    const { container } = render(
      <PayoutTable N={10} contribution={100n * USDT_SCALE} feeBps={300} alphaMaxBps={1000} />,
    );

    const rows = container.querySelectorAll('tr[data-slot]');
    expect(rows.length).toBe(10);

    const slot1 = container.querySelector('tr[data-slot="1"] td[data-payout]');
    const slot10 = container.querySelector('tr[data-slot="10"] td[data-payout]');
    expect(slot1).not.toBeNull();
    expect(slot10).not.toBeNull();

    const p1 = BigInt(slot1!.getAttribute('data-payout')!);
    const p10 = BigInt(slot10!.getAttribute('data-payout')!);
    expect(p1 < p10).toBe(true);
  });

  it('with alpha=0 all slot payouts are equal', () => {
    const { container } = render(
      <PayoutTable N={5} contribution={50n * USDT_SCALE} feeBps={200} alphaMaxBps={0} />,
    );
    const payouts = Array.from(container.querySelectorAll('td[data-payout]')).map((el) =>
      BigInt(el.getAttribute('data-payout')!),
    );
    for (const p of payouts) expect(p).toBe(payouts[0]);
  });

  it('marks taken slots and skips them on click', () => {
    let picked: number | null = null;
    const { container } = render(
      <PayoutTable
        N={4}
        contribution={10n * USDT_SCALE}
        feeBps={200}
        alphaMaxBps={500}
        takenSlots={[2]}
        onPick={(s) => {
          picked = s;
        }}
      />,
    );
    const taken = container.querySelector('tr[data-slot="2"]');
    expect(taken?.getAttribute('data-taken')).toBe('true');

    (container.querySelector('tr[data-slot="2"]') as HTMLElement).click();
    expect(picked).toBeNull();

    (container.querySelector('tr[data-slot="3"]') as HTMLElement).click();
    expect(picked).toBe(3);
  });
});
