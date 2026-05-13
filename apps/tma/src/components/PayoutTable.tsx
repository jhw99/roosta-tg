'use client';

import { useMemo } from 'react';
import { calculate_payout } from '@roosta/shared/payout';
import { fmtUSDT } from '../lib/format';

export interface PayoutTableProps {
  N: number;
  contribution: bigint; // smallest units
  feeBps: number;
  alphaMaxBps: number;
  /** Slot numbers (1-indexed) that are taken */
  takenSlots?: number[];
  /** Slot the user has selected (1-indexed) */
  selectedSlot?: number | null;
  /** Called when an available slot is picked. Omit to make table read-only. */
  onPick?: (slot: number) => void;
}

export function PayoutTable({
  N,
  contribution,
  feeBps,
  alphaMaxBps,
  takenSlots = [],
  selectedSlot = null,
  onPick,
}: PayoutTableProps) {
  const rows = useMemo(() => {
    return Array.from({ length: N }, (_, i) =>
      calculate_payout({ N, C: contribution, F_bps: feeBps, alpha_max_bps: alphaMaxBps, k: i + 1 }),
    );
  }, [N, contribution, feeBps, alphaMaxBps]);

  const taken = new Set(takenSlots);
  const interactive = !!onPick;

  return (
    <div className="overflow-hidden rounded-xl border border-black/10">
      <table className="w-full text-sm" data-testid="payout-table">
        <thead className="bg-black/5">
          <tr className="text-left">
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Adj</th>
            <th className="px-3 py-2 text-right">Payout</th>
            {interactive && <th className="px-3 py-2 text-right">Status</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const slot = i + 1;
            const isTaken = taken.has(slot);
            const isSelected = selectedSlot === slot;
            const adjPct = (r.adjustment_bps / 100).toFixed(2);
            return (
              <tr
                key={slot}
                data-slot={slot}
                data-taken={isTaken ? 'true' : 'false'}
                data-selected={isSelected ? 'true' : 'false'}
                onClick={() => interactive && !isTaken && onPick?.(slot)}
                className={[
                  'border-t border-black/5',
                  interactive && !isTaken ? 'cursor-pointer hover:bg-blue-50' : '',
                  isSelected ? 'bg-blue-100' : '',
                  isTaken ? 'opacity-50' : '',
                ].join(' ')}
              >
                <td className="px-3 py-2 font-medium">{slot}</td>
                <td className="px-3 py-2 tabular-nums">
                  {r.adjustment_bps > 0 ? '+' : ''}
                  {adjPct}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums" data-payout={r.payout.toString()}>
                  {fmtUSDT(r.payout)}
                </td>
                {interactive && (
                  <td className="px-3 py-2 text-right text-xs opacity-80">
                    {isTaken ? 'taken' : isSelected ? 'selected' : 'available'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
