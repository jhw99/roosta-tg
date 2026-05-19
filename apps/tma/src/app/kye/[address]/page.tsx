'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Address, toNano } from '@ton/core';
import {
  buildContributeBody,
  buildEmergencyCancelBody,
  buildExecuteRoundBody,
} from '@roosta/shared/contractMessages';
import { calculate_payout } from '@roosta/shared/payout';
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

  // GET /kyes/:id is a PUBLIC route (post-fix 4feb400) — the backend does
  // not see initData and cannot stamp `isMe` per row. Derive locally by
  // comparing each member's userId to the logged-in /me user.id. Falls
  // back to the (legacy) backend-stamped isMe when present.
  const me = members.find((m) => m.isMe || (user && m.userId === user.id)) ?? null;
  const myStatus = me?.currentRoundStatus ?? 'pending';

  // Hard lock: once a contribution is broadcast we DO NOT re-enable the
  // button until either (a) the indexer has flipped myStatus to 'paid' OR
  // (b) a 90s indexer-confirmation window has expired AND the vault
  // balance has visibly decreased (proving the contract accepted the
  // contribute, not a bounce-refund). The prior version flipped
  // `contributing` back to false as soon as the relay promise resolved —
  // which let users hammer the button while waiting for chain confirmation
  // and silently pump vault balance via bounced messages.
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);
  const submittedVaultBalance = useRef<bigint | null>(null);
  // Explicit transaction outcome surface — 'success' / 'failed' / 'pending'
  // shown as a banner so the user knows the contribute settled or failed,
  // instead of just silently going back to the same screen state.
  const [txOutcome, setTxOutcome] = useState<
    null | { kind: 'success'; text: string } | { kind: 'failed'; text: string }
  >(null);

  useEffect(() => {
    // Once the indexer reports 'paid' AND we are waiting on a submission,
    // surface a SUCCESS banner and clear the lock.
    if (myStatus === 'paid' && submittedAt != null) {
      setSubmittedAt(null);
      submittedVaultBalance.current = null;
      setContributing(false);
      setTxOutcome({ kind: 'success', text: s.kye.contributeSuccess });
    }
  }, [myStatus, submittedAt, s.kye.contributeSuccess]);

  const contribute = useCallback(async () => {
    if (!kye) return;
    if (!vault.ready || !vault.vaultAddress) {
      setTxOutcome({ kind: 'failed', text: s.vault.notActivated });
      return;
    }
    // Pre-flight: vault must have enough balance for contribution + gas margin.
    const required = BigInt(kye.params.contribution) + CONTRIBUTE_GAS_MARGIN;
    const balance = vault.state?.balance ?? 0n;
    if (balance < required) {
      setTxOutcome({
        kind: 'failed',
        text: s.kye.contributeFailedInsufficient(
          fmtUSDT(required),
          fmtUSDT(balance),
        ),
      });
      return;
    }
    setContributing(true);
    setError(null);
    setTxOutcome(null);
    submittedVaultBalance.current = balance;
    setSubmittedAt(Date.now());
    try {
      await signAndRelay({
        vaultAddress: vault.vaultAddress,
        target: Address.parse(kye.contractAddress),
        amount: required,
        body: buildContributeBody(kye.currentRound),
      });
      // Broadcast OK — outcome resolves via myStatus watcher OR watchdog.
    } catch (e) {
      const msg = e instanceof Error ? e.message : s.common.error;
      setError(msg);
      setTxOutcome({ kind: 'failed', text: msg });
      setContributing(false);
      setSubmittedAt(null);
    }
  }, [kye, vault.ready, vault.vaultAddress, vault.state, s.common.error, s.kye.contributeFailedInsufficient, s.vault.notActivated]);

  // Watchdog: after 90s with no indexer flip to 'paid', release the lock
  // AND show a failed-banner if the vault balance never decreased
  // (= the contract rejected the contribute / bounced).
  useEffect(() => {
    if (!submittedAt) return;
    const handle = setTimeout(() => {
      const balanceNow = vault.state?.balance ?? 0n;
      const balanceBefore = submittedVaultBalance.current ?? balanceNow;
      const decreased = balanceNow < balanceBefore;
      if (!decreased) {
        setTxOutcome({ kind: 'failed', text: s.kye.contributeStuck });
      } else {
        // Decreased but indexer hasn't flipped status — likely settled,
        // surface a soft "submitted" success instead of leaving silent.
        setTxOutcome({ kind: 'success', text: s.kye.contributeSubmittedSoft });
      }
      setSubmittedAt(null);
      submittedVaultBalance.current = null;
      setContributing(false);
    }, 90_000);
    return () => clearTimeout(handle);
  }, [submittedAt, vault.state, s.kye.contributeStuck, s.kye.contributeSubmittedSoft]);

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

  // Organizer manually triggers the round execution. This is the
  // "decide now" lever: organizer can wait (do nothing), execute the
  // round with the current default policy (whatever it was set to at
  // creation — pro_rata / cancel / organizer_cover) by clicking this,
  // or just cancel the whole circle via the existing delete-button
  // path (works even after status='active' if the organizer chose so
  // when creating — current contract restricts EmergencyCancel to
  // status='created' though, see kye.tact).
  //
  // The contract enforces grace_window (5 min after eligibleAt) before
  // it accepts ExecuteRound when there are missing contributions, so
  // the click is safe to make any time after deadline + 5 min.
  const [executingRound, setExecutingRound] = useState(false);
  const executeRound = useCallback(async () => {
    if (!kye) return;
    if (!vault.ready || !vault.vaultAddress) {
      setError(s.vault.notActivated);
      return;
    }
    setExecutingRound(true);
    setError(null);
    try {
      await signAndRelay({
        vaultAddress: vault.vaultAddress,
        target: Address.parse(kye.contractAddress),
        amount: CANCEL_FORWARD_TON, // gas-only forward; payouts come from contract pool
        body: buildExecuteRoundBody(0),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : s.common.error);
    } finally {
      setExecutingRound(false);
    }
  }, [kye, vault.ready, vault.vaultAddress, s.common.error, s.vault.notActivated]);

  const share = useCallback(() => {
    if (!kye) return;
    // Always share the Telegram bot deep-link so the recipient lands inside the
    // mini app (where initData / vault / TonConnect are available), not the
    // bare Vercel URL.
    const url = `https://t.me/RoostaApp_Bot/app?startapp=join_${kye.contractAddress}`;
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
            value={`${fmtUSDT(BigInt(kye.params.contribution))} USDC`}
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

      {/* Transaction outcome banner — explicit success/failed feedback
          after every contribute attempt. Dismissable. */}
      {txOutcome && (
        <section className="px-4 pb-2">
          <div
            role="alert"
            className={
              txOutcome.kind === 'success'
                ? 'flex items-start gap-2 rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-900'
                : 'flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900'
            }
          >
            <span>{txOutcome.kind === 'success' ? '✅' : '❌'}</span>
            <p className="flex-1">{txOutcome.text}</p>
            <button
              type="button"
              onClick={() => setTxOutcome(null)}
              className="text-xs opacity-70 hover:opacity-100"
              aria-label="dismiss"
            >
              ✕
            </button>
          </div>
        </section>
      )}

      {me && kye.status === 'active' && (() => {
        // Intuitive role panel: show explicitly what the user is expected
        // to pay this round AND what they receive (and when). Members
        // were confused about whether "Contribute" meant pay-in or
        // receive — now we spell out both.
        const contributionStr = `${fmtUSDT(BigInt(kye.params.contribution))} USDC`;
        let payoutStr = contributionStr;
        try {
          const payout = calculate_payout({
            N: kye.params.N,
            C: BigInt(kye.params.contribution),
            F_bps: kye.params.feeRateBps,
            alpha_max_bps: kye.params.alphaMaxBps,
            k: me.orderNum,
          });
          payoutStr = `${fmtUSDT(payout.payout)} USDC`;
        } catch { /* ignore — fall back to contribution amount */ }
        const myReceivedAlready = me.orderNum < kye.currentRound;
        return (
          <section className="px-4 pb-2 space-y-2">
            {/* Role summary */}
            <div className="rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 p-3 text-sm">
              <p className="text-xs font-semibold opacity-70">{s.kye.myRoleHeading}</p>
              <p className="mt-1">
                {myStatus === 'paid'
                  ? `Round ${kye.currentRound} ✅ ${contributionStr}`
                  : s.kye.myRolePayThisRound(kye.currentRound, contributionStr)}
              </p>
              <p className="mt-1 opacity-80">
                {myReceivedAlready
                  ? s.kye.myRoleAlreadyReceived(me.orderNum)
                  : s.kye.myRoleReceiveAt(me.orderNum, payoutStr)}
              </p>
            </div>

            {/* Pay button */}
            {myStatus !== 'paid' && (
              <div className="rounded-xl border border-black/5 bg-[var(--color-secondary-bg)] p-3">
                <button
                  type="button"
                  onClick={() => void contribute()}
                  disabled={contributing || submittedAt != null}
                  className="w-full rounded-xl bg-[var(--color-primary)] py-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  {contributing || submittedAt != null
                    ? s.kye.contributing
                    : s.kye.contributeNow}
                </button>
                {submittedAt != null && (
                  <p className="mt-1 text-xs opacity-60 text-center">
                    {s.kye.contributePending}
                  </p>
                )}
              </div>
            )}
            {myStatus === 'paid' && (
              <p className="text-center text-xs text-green-700">
                ✅ {s.kye.paid}
              </p>
            )}
            {myStatus === 'defaulted' && (
              <p className="text-center text-xs text-red-700">
                ⚠️ {s.kye.defaulted}
              </p>
            )}
          </section>
        );
      })()}

      {/* Organizer decision panel — visible only to the organizer on an
          active circle. Shows the current default policy + an explicit
          "Execute round" CTA so the organizer can decide WHEN to settle
          (instead of the scheduler firing silently). Cancel still routes
          through the existing delete-circle button (which is itself
          gated on status='created' by the contract). */}
      {(() => {
        if (!isOrganizer || kye.status !== 'active') return null;
        const nowSec = Math.floor(Date.now() / 1000);
        const deadlineSec = kye.nextRoundAt ?? 0;
        const intervalSec = kye.params.roundIntervalSec ?? 0;
        const earliestSec = deadlineSec + intervalSec;
        const secsRemaining = Math.max(0, earliestSec - nowSec);
        const beforeGrace = deadlineSec > 0 && nowSec < deadlineSec;
        const inGrace = deadlineSec > 0 && nowSec >= deadlineSec && secsRemaining > 0;
        const graceExpired = !beforeGrace && !inGrace;
        // Defaulter check: anyone whose this-round status is still 'pending'.
        const hasDefaulter = members.some((m) => m.currentRoundStatus !== 'paid');
        const canExecute = graceExpired;
        const canCancel = graceExpired && hasDefaulter;
        const policyName =
          kye.params.defaultPolicy === 'pro_rata'
            ? s.create.policyProRata
            : kye.params.defaultPolicy === 'cancel'
              ? s.create.policyCancel
              : s.create.policyOrganizerCover;
        return (
          <section className="px-4 pb-2">
            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">
                {s.kye.organizerPanel}
              </p>
              <p className="mt-1 text-xs text-amber-800">
                {s.kye.organizerPanelBody(policyName)}
              </p>
              {inGrace && (
                <p className="mt-1 text-xs text-amber-700">
                  {s.kye.organizerGraceCountdown(Math.ceil(secsRemaining / 60))}
                </p>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void executeRound()}
                  disabled={executingRound || !canExecute}
                  className="rounded-xl bg-amber-600 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {executingRound
                    ? s.kye.executingRound
                    : beforeGrace
                      ? s.kye.executeRoundBeforeDeadline
                      : inGrace
                        ? s.kye.executeRoundInGrace
                        : s.kye.executeRound}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleting || !canCancel}
                  className="rounded-xl border-2 border-red-400 py-2 text-sm font-medium text-red-700 disabled:opacity-40"
                  title={
                    !graceExpired
                      ? s.kye.organizerCancelLockedGrace
                      : !hasDefaulter
                        ? s.kye.organizerCancelNoDefaulter
                        : undefined
                  }
                >
                  {s.kye.organizerCancelActive}
                </button>
              </div>
              {!canCancel && graceExpired && !hasDefaulter && (
                <p className="mt-1 text-[10px] text-amber-700">
                  {s.kye.organizerCancelNoDefaulter}
                </p>
              )}
            </div>
          </section>
        );
      })()}

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
