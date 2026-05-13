'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../../components/PageHeader';
import { useStrings } from '../../../../hooks/useStrings';
import { api, type ApiRound } from '../../../../lib/api';
import { fmtUSDT, shortAddress, tonscanTxUrl } from '../../../../lib/format';

function formatDate(unix: number | null): string {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleString();
}

export default function Rounds({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const s = useStrings();
  const [rounds, setRounds] = useState<ApiRound[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortDesc, setSortDesc] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.rounds(address);
        if (!cancelled) setRounds(data.rounds);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : s.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, s.common.error]);

  const sorted = useMemo(
    () => [...rounds].sort((a, b) => (sortDesc ? b.roundNum - a.roundNum : a.roundNum - b.roundNum)),
    [rounds, sortDesc],
  );

  return (
    <main>
      <PageHeader title={s.rounds.title} subtitle={shortAddress(address)} />
      <section className="p-4">
        {loading && <p className="opacity-70">{s.common.loading}</p>}
        {error && <p className="text-red-700">{error}</p>}
        {!loading && !error && (
          <div className="overflow-hidden rounded-xl border border-black/10">
            <table className="w-full text-sm">
              <thead className="bg-black/5">
                <tr className="text-left">
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setSortDesc((d) => !d)}
                      className="inline-flex items-center gap-1"
                    >
                      {s.rounds.columnRound} {sortDesc ? '↓' : '↑'}
                    </button>
                  </th>
                  <th className="px-3 py-2">{s.rounds.columnScheduled}</th>
                  <th className="px-3 py-2">{s.rounds.columnExecuted}</th>
                  <th className="px-3 py-2">{s.rounds.columnWinner}</th>
                  <th className="px-3 py-2 text-right">{s.rounds.columnPayout}</th>
                  <th className="px-3 py-2">{s.rounds.columnTx}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const isDefaulted = (r.defaulters?.length ?? 0) > 0 && !r.executedAt;
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-black/5 ${isDefaulted ? 'bg-red-50' : ''}`}
                    >
                      <td className="px-3 py-2 font-medium">{r.roundNum}</td>
                      <td className="px-3 py-2 text-xs">{formatDate(r.scheduledAt)}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.executedAt ? formatDate(r.executedAt) : (
                          <span className="opacity-60">{s.rounds.pending}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.winnerHandle ? `@${r.winnerHandle}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.payout ? fmtUSDT(BigInt(r.payout)) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.txHash ? (
                          <a
                            href={tonscanTxUrl(r.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-primary)] underline"
                          >
                            {shortAddress(r.txHash, 4, 4)}
                          </a>
                        ) : isDefaulted ? (
                          <span className="text-red-700 font-medium">{s.rounds.defaulted}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
