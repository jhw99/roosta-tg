'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Address, toNano } from '@ton/core';
import {
  buildContributeBody,
  buildEmergencyCancelBody,
} from '@roosta/shared/contractMessages';
import { PageHeader } from '../../../components/PageHeader';
import { StatusBadge } from '../../../components/StatusBadge';
import { MemberRow } from '../../../components/MemberRow';
import { Countdown } from '../../../components/Countdown';
import { ConfirmationDialog } from '../../../components/ConfirmationDialog';
import { LoadingOverlay } from '../../../components/LoadingOverlay';
import { useStrings } from '../../../hooks/useStrings';
import { useVault } from '../../../hooks/useVault';
import { api, type ApiKye, type ApiMember } from '../../../lib/api';
import { signAndRelay } from '../../../lib/vault';
import { fmtUSDT, shortAddress, tonscanAddressUrl } from '../../../lib/format';
import { markDeleting } from '../../../lib/deletingCircles';
import { useAppStore } from '../../../store';

// Gas margin added on top of the contribution amount the vault forwards.
const CONTRIBUTE_GAS_MARGIN = toNano('0.02');
// EmergencyCancel: gas-only forward (no value semantics in the message).
const CANCEL_FORWARD_TON = toNano('0.02');

export default function KyeDetail({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const router = useRouter();
  const s = useStrings();
  const vault = useVault();
  const user = useAppStore((st) => st.user);
  const [kye, setKye] = useState<ApiKye | null>(null);
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contributing, setContributing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    if (!vault.ready || !vault.vaultAddress) {
      setError('Activate your gasless vault first (from the home screen).');
      return;
    }
    setContributing(true);
    setError(null);
    try {
      // The vault forwards the contribution amount itself; the relayer covers
      // gas. The contract refunds any excess back to the vault.
      const amount = BigInt(kye.params.contribution) + CONTRIBUTE_GAS_MARGIN;
      await signAndRelay({
        vaultAddress: vault.vaultAddress,
        target: Address.parse(kye.contractAddress),
        amount,
        body: buildContributeBody(kye.currentRound),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : s.common.error);
    } finally {
      setContributing(false);
    }
  }, [kye, vault.ready, vault.vaultAddress, s.common.error]);

  const isOrganizer = !!(user && kye && user.id === kye.organizerId);
  const canDelete = !!(isOrganizer && kye && kye.status === 'created');
  const organizerAlreadyJoined = !!(
    user && members.some((m) => m.userId === user.id)
  );
  const canOrganizerJoin = !!(
    isOrganizer && kye && kye.status === 'created' && !organizerAlreadyJoined
  );

  const deleteCircle = useCallback(async () => {
    if (!kye) return;
    if (!vault.vaultAddress) {
      setError(s.vault.notActivated);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      // signAndRelay verifies the vault is deployed + funded; we don't gate
      // on vault.ready (a stale local state) so the click never silently noops.
      await signAndRelay({
        vaultAddress: vault.vaultAddress,
        target: Address.parse(kye.contractAddress),
        amount: CANCEL_FORWARD_TON,
        body: buildEmergencyCancelBody(0),
      });
      // Mark locally so the home list shows the row as "deleting" until the
      // indexer flips the on-chain status to 'cancelled' (~30 s – 2 min).
      markDeleting(kye.contractAddress);
      setConfirmDelete(false);
      alert(s.kye.deleteSubmittedNotice);
      router.push('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : s.common.error);
      setDeleting(false);
    }
  }, [kye, vault.vaultAddress, router, s.common.error, s.vault.notActivated, s.kye.deleteSubmittedNotice]);

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

      <section className="px-4 pt-2 pb-2">
        <h2 className="mb-2 font-semibold text-sm">{s.kye.circleInfo}</h2>
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label={s.home.contribution}
            value={`${fmtUSDT(BigInt(kye.params.contribution))} USDT`}
          />
          <Stat
            label={s.create.interval}
            value={
              kye.params.roundIntervalSec < 7 * 24 * 3600
                ? s.create.testInterval
                : s.create.weeks(Math.round(kye.params.roundIntervalSec / (7 * 24 * 3600)))
            }
          />
          <Stat
            label={s.create.feeRate}
            value={`${(kye.params.feeRateBps / 100).toFixed(2)}%`}
          />
          <Stat
            label={s.create.defaultPolicy}
            value={
              kye.params.defaultPolicy === 'pro_rata'
                ? s.create.policyProRata
                : kye.params.defaultPolicy === 'cancel'
                  ? s.create.policyCancel
                  : s.create.policyOrganizerCover
            }
          />
          <Stat
            label={s.home.members}
            value={`${members.length}/${kye.params.N}`}
          />
          <Stat
            label={s.create.alphaMax}
            value={`${(kye.params.alphaMaxBps / 100).toFixed(2)}%`}
          />
        </div>
      </section>

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
        {canOrganizerJoin && (
          <Link
            href={`/join/${kye.contractAddress}`}
            className="block rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary)]/5 p-3 text-sm text-center font-medium text-[var(--color-primary)]"
          >
            {s.kye.organizerJoin}
          </Link>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="block w-full rounded-xl border border-red-300 p-3 text-sm text-red-700"
          >
            {s.kye.deleteCircle}
          </button>
        )}
      </section>

      <LoadingOverlay
        open={contributing || deleting}
        message={contributing ? s.kye.contributing : s.kye.deleting}
        hint={s.common.loadingHint}
      />
      <ConfirmationDialog
        open={confirmDelete && !deleting}
        title={s.kye.deleteCircleTitle}
        confirmLabel={s.kye.deleteCircle}
        cancelLabel={s.common.cancel}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void deleteCircle()}
        busy={deleting}
      >
        {s.kye.deleteCircleBody}
      </ConfirmationDialog>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-secondary-bg)] p-3">
      <p className="text-xs opacity-60">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
