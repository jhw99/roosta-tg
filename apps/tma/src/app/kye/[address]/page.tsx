'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { buildContributeBody, cellToBase64 } from '@roosta/shared/contractMessages';
import { PageHeader } from '../../../components/PageHeader';
import { StatusBadge } from '../../../components/StatusBadge';
import { MemberRow } from '../../../components/MemberRow';
import { Countdown } from '../../../components/Countdown';
import { useStrings } from '../../../hooks/useStrings';
import { api, type ApiKye, type ApiMember } from '../../../lib/api';
import { fmtUSDT, shortAddress, tonscanAddressUrl } from '../../../lib/format';

export default function KyeDetail({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const s = useStrings();
  const [tonConnectUI] = useTonConnectUI();
  const [kye, setKye] = useState<ApiKye | null>(null);
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contributing, setContributing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api.kye(address);
        if (!cancelled) {
          setKye(data.kye);
          setMembers(data.members);
        }
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

  const me = members.find((m) => m.isMe) ?? null;
  const myStatus = me?.currentRoundStatus ?? 'pending';

  const contribute = useCallback(async () => {
    if (!kye) return;
    setContributing(true);
    try {
      const body = buildContributeBody(kye.currentRound);
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [
          {
            address: kye.contractAddress,
            amount: '50000000',
            payload: cellToBase64(body),
          },
        ],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : s.common.error);
    } finally {
      setContributing(false);
    }
  }, [kye, tonConnectUI, s.common.error]);

  const share = useCallback(() => {
    if (!kye) return;
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${kye.contractAddress}`;
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: { url: string; title?: string }) => Promise<void> }) : null;
    if (nav?.share) {
      void nav.share({ url, title: kye.name });
    } else if (nav?.clipboard) {
      void nav.clipboard.writeText(url);
    }
  }, [kye]);

  if (loading) {
    return (
      <main>
        <PageHeader title={s.common.loading} subtitle={shortAddress(address)} />
      </main>
    );
  }
  if (!kye) {
    return (
      <main>
        <PageHeader title={s.common.error} subtitle={shortAddress(address)} />
        <p className="p-4 text-red-700">{error}</p>
      </main>
    );
  }

  const totalRounds = kye.params.N;
  const progressPct = Math.min(100, Math.round((kye.currentRound / totalRounds) * 100));

  return (
    <main>
      <PageHeader
        title={kye.name}
        subtitle={
          <span className="flex items-center gap-2">
            <StatusBadge status={kye.status} label={s.status[kye.status]} />
            {kye.organizerHandle && <span className="opacity-70">@{kye.organizerHandle}</span>}
            <button type="button" onClick={share} className="ml-auto text-xs underline">
              {s.kye.share}
            </button>
          </span>
        }
      />

      <section className="px-4 pt-4">
        <div className="mb-1 flex items-center justify-between text-xs opacity-70">
          <span>
            {s.kye.progress} {kye.currentRound} {s.kye.of} {totalRounds}
          </span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/10">
          <div
            className="h-full bg-[var(--color-primary)] transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </section>

      {kye.nextRoundAt && kye.status === 'active' && (
        <section className="p-4">
          <div className="rounded-2xl bg-[var(--color-secondary-bg)] p-4 text-center">
            <p className="text-xs opacity-60">{s.kye.nextRound}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              <Countdown targetUnixSec={kye.nextRoundAt} />
            </p>
          </div>
        </section>
      )}

      {me && kye.status === 'active' && (
        <section className="px-4 pb-2">
          <div className="rounded-xl border border-black/5 bg-[var(--color-secondary-bg)] p-3 text-sm">
            <p className="opacity-70">
              {s.kye.you}: {s.kye.progress} {kye.currentRound}{' '}
              <span
                className={
                  myStatus === 'paid'
                    ? 'text-green-700'
                    : myStatus === 'defaulted'
                      ? 'text-red-700'
                      : 'text-gray-700'
                }
              >
                ({myStatus === 'paid' ? s.kye.paid : myStatus === 'defaulted' ? s.kye.defaulted : s.kye.pending})
              </span>
            </p>
            {myStatus !== 'paid' && (
              <button
                type="button"
                onClick={() => void contribute()}
                disabled={contributing}
                className="mt-2 w-full rounded-xl bg-[var(--color-primary)] py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {contributing ? s.kye.contributing : s.kye.contributeNow} ·{' '}
                {fmtUSDT(BigInt(kye.params.contribution))} USDT
              </button>
            )}
          </div>
        </section>
      )}

      <section className="px-4 pb-4">
        <h2 className="mb-2 font-semibold text-sm">{s.kye.members}</h2>
        <ul className="space-y-2">
          {[...members]
            .sort((a, b) => a.orderNum - b.orderNum)
            .map((m) => (
              <MemberRow key={m.id} member={m} strings={s} />
            ))}
        </ul>
      </section>

      <section className="px-4 pb-8 space-y-2">
        <Link
          href={`/kye/${kye.contractAddress}/rounds`}
          className="block rounded-xl border border-black/10 p-3 text-sm text-center"
        >
          {s.kye.rounds}
        </Link>
        <a
          href={tonscanAddressUrl(kye.contractAddress)}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border border-black/10 p-3 text-sm text-center"
        >
          {s.kye.tonscan}
        </a>
      </section>
    </main>
  );
}
