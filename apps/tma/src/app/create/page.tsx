'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { calculate_payout } from '@roosta/shared/payout';
import { buildCreateKyeBody, cellToBase64 } from '@roosta/shared/contractMessages';
import type { DefaultPolicy } from '@roosta/shared';

const POLICY_TO_INT: Record<DefaultPolicy, number> = {
  pro_rata: 0,
  cancel: 1,
  organizer_cover: 2,
};
import { PageHeader } from '../../components/PageHeader';
import { PayoutTable } from '../../components/PayoutTable';
import { WarningCallout } from '../../components/WarningCallout';
import { MainButtonShim } from '../../components/MainButtonShim';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { useStrings } from '../../hooks/useStrings';
import { computeWarnings } from '../../lib/warnings';
import { USDT_SCALE, fmtUSDT } from '../../lib/format';
import { api } from '../../lib/api';

const FACTORY_ADDRESS =
  process.env.NEXT_PUBLIC_KYE_FACTORY_ADDRESS ??
  'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export default function CreateKye() {
  const s = useStrings();
  const router = useRouter();
  const [tonConnectUI] = useTonConnectUI();
  const userAddress = useTonAddress();

  const [name, setName] = useState('');
  const [N, setN] = useState(5);
  const [contribution, setContribution] = useState(100);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [feePct, setFeePct] = useState(2);
  const [alphaPct, setAlphaPct] = useState(0);
  const [policy, setPolicy] = useState<DefaultPolicy>('pro_rata');

  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ link: string; address: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const C = BigInt(Math.max(0, contribution)) * USDT_SCALE;
  const feeBps = Math.round(feePct * 100);
  const alphaBps = Math.round(alphaPct * 100);

  const warnings = useMemo(
    () => computeWarnings({ N, feeBps, alphaMaxBps: alphaBps, roundIntervalWeeks: intervalWeeks }, s),
    [N, feeBps, alphaBps, intervalWeeks, s],
  );

  const sample = useMemo(
    () =>
      calculate_payout({
        N,
        C,
        F_bps: feeBps,
        alpha_max_bps: alphaBps,
        k: 1,
      }),
    [N, C, feeBps, alphaBps],
  );
  // Total organizer revenue across all N rounds = N * organizer_fee_per_round
  const totalOrganizerRevenue = sample.organizer_fee * BigInt(N);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const params = {
        name: name.trim() || 'Untitled Kye',
        N,
        contribution: C.toString(),
        roundIntervalSec: intervalWeeks * 7 * 24 * 3600,
        feeRateBps: feeBps,
        alphaMaxBps: alphaBps,
        defaultPolicy: policy,
      };
      const res = await api.createKye({
        name: params.name,
        memberCount: N,
        contribution: params.contribution,
        roundIntervalSec: params.roundIntervalSec,
        feeRateBps: params.feeRateBps,
        alphaMaxBps: params.alphaMaxBps,
        defaultPolicy: POLICY_TO_INT[policy],
      });

      // Build a TON Connect transaction encoding the KyeFactory.createKye body.
      try {
        if (!userAddress) {
          throw new Error('Connect a TON wallet first');
        }
        const salt = BigInt(Math.floor(Date.now() / 1000)) ^
          BigInt(Math.floor(Math.random() * 0xffff_ffff));
        const body = buildCreateKyeBody({
          organizer: Address.parse(userAddress),
          memberCount: BigInt(N),
          contribution: C,
          roundIntervalSec: BigInt(params.roundIntervalSec),
          feeRateBps: BigInt(feeBps),
          timeAdjustmentMaxBps: BigInt(alphaBps),
          defaultPolicy: BigInt(POLICY_TO_INT[policy]),
          salt,
        });
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 360,
          messages: [
            {
              address: FACTORY_ADDRESS,
              amount: '50000000', // 0.05 TON for gas
              payload: cellToBase64(body),
            },
          ],
        });
      } catch (txErr) {
        // If user rejected, surface but keep invite link visible.
        if (txErr instanceof Error) setError(txErr.message);
      }

      setInvite({ link: res.inviteLink, address: res.predictedAddress });
    } catch (e) {
      setError(e instanceof Error ? e.message : s.common.error);
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }, [name, N, C, intervalWeeks, feeBps, alphaBps, policy, tonConnectUI, userAddress, s.common.error]);

  const copyInvite = useCallback(async () => {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [invite]);

  const shareInvite = useCallback(() => {
    if (!invite) return;
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: { url: string; title?: string }) => Promise<void> }) : null;
    if (nav?.share) {
      void nav.share({ url: invite.link, title: s.create.inviteLink });
    } else {
      void copyInvite();
    }
  }, [invite, copyInvite, s.create.inviteLink]);

  if (invite) {
    return (
      <main>
        <PageHeader title={s.create.title} subtitle={invite.address} />
        <section className="p-4 space-y-4">
          <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <p className="font-medium">{s.create.inviteLink}</p>
            <p className="mt-2 break-all text-xs">{invite.link}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyInvite}
              className="flex-1 rounded-xl border border-black/10 py-2 text-sm"
            >
              {copied ? s.create.copied : s.create.copy}
            </button>
            <button
              type="button"
              onClick={shareInvite}
              className="flex-1 rounded-xl bg-[var(--color-primary)] py-2 text-sm font-medium text-white"
            >
              {s.create.share}
            </button>
          </div>
          <button
            type="button"
            onClick={() => router.push(`/kye/${invite.address}`)}
            className="w-full rounded-xl border border-black/10 py-2 text-sm"
          >
            Open kye
          </button>
        </section>
      </main>
    );
  }

  return (
    <main>
      <PageHeader title={s.create.title} subtitle={s.create.subtitle} />
      <section className="p-4 grid gap-4">
        <Field label={s.create.name}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Spring Kye"
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm"
          />
        </Field>

        <Field label={`${s.create.members}: ${N}`}>
          <input
            type="range"
            min={2}
            max={30}
            value={N}
            onChange={(e) => setN(Number(e.target.value))}
          />
        </Field>

        <Field label={`${s.create.contribution}`}>
          <input
            type="number"
            min={1}
            value={contribution}
            onChange={(e) => setContribution(Number(e.target.value))}
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm tabular-nums"
          />
        </Field>

        <Field label={s.create.interval}>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((w) => (
              <label
                key={w}
                className={`flex-1 cursor-pointer rounded-lg border px-2 py-2 text-center text-xs whitespace-nowrap ${
                  intervalWeeks === w
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                    : 'border-black/10'
                }`}
              >
                <input
                  type="radio"
                  name="interval"
                  value={w}
                  checked={intervalWeeks === w}
                  onChange={() => setIntervalWeeks(w)}
                  className="sr-only"
                />
                {s.create.weeks(w)}
              </label>
            ))}
          </div>
        </Field>

        <Field label={`${s.create.feeRate}: ${feePct}%`}>
          <input
            type="range"
            min={2}
            max={10}
            step={0.5}
            value={Math.min(feePct, 10)}
            onChange={(e) => setFeePct(Number(e.target.value))}
          />
          <input
            type="number"
            min={2}
            step={0.1}
            value={feePct}
            onChange={(e) => setFeePct(Number(e.target.value))}
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm tabular-nums"
          />
        </Field>

        <Field label={`${s.create.alphaMax}: ${alphaPct}%`}>
          <input
            type="range"
            min={0}
            max={20}
            step={0.5}
            value={Math.min(alphaPct, 20)}
            onChange={(e) => setAlphaPct(Number(e.target.value))}
          />
          <input
            type="number"
            min={0}
            step={0.1}
            value={alphaPct}
            onChange={(e) => setAlphaPct(Number(e.target.value))}
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm tabular-nums"
          />
        </Field>

        <Field label={s.create.orderMethod}>
          <select
            disabled
            value="preassigned"
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm"
          >
            <option value="preassigned">{s.create.preassigned}</option>
          </select>
        </Field>

        <Field label={s.create.defaultPolicy}>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['pro_rata', s.create.policyProRata],
                ['cancel', s.create.policyCancel],
                ['organizer_cover', s.create.policyOrganizerCover],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-lg border px-2 py-2 text-center text-xs leading-tight whitespace-nowrap ${
                  policy === value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                    : 'border-black/10'
                }`}
              >
                <input
                  type="radio"
                  name="policy"
                  value={value}
                  checked={policy === value}
                  onChange={() => setPolicy(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-black/60">
            {policy === 'pro_rata' && s.create.policyProRataDesc}
            {policy === 'cancel' && s.create.policyCancelDesc}
            {policy === 'organizer_cover' && s.create.policyOrganizerCoverDesc}
          </p>
        </Field>
      </section>

      {warnings.length > 0 && (
        <section className="px-4 pb-4">
          <WarningCallout items={warnings} />
        </section>
      )}

      <section className="px-4 pb-4">
        <h2 className="mb-2 font-semibold">{s.create.payoutTable}</h2>
        <PayoutTable N={N} contribution={C} feeBps={feeBps} alphaMaxBps={alphaBps} />
      </section>

      <section className="px-4 pb-28">
        <div className="rounded-xl bg-[var(--color-secondary-bg)] p-3 text-sm">
          <p className="opacity-70">{s.create.expectedRevenue}</p>
          <p className="text-lg font-semibold tabular-nums">
            {fmtUSDT(totalOrganizerRevenue)} USDT
          </p>
          <p className="text-xs opacity-60">
            {fmtUSDT(sample.organizer_fee)} USDT × {N} ({s.create.perRound})
          </p>
        </div>
        {error && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
      </section>

      <ConfirmationDialog
        open={confirmOpen}
        title={s.create.create}
        confirmLabel={submitting ? s.create.creating : s.create.create}
        cancelLabel={s.common.cancel}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmOpen(false)}
        busy={submitting}
      >
        <p>
          {N} × {fmtUSDT(C)} USDT — {s.create.weeks(intervalWeeks)}
        </p>
      </ConfirmationDialog>

      <MainButtonShim
        text={submitting ? s.create.creating : s.create.create}
        onClick={() => setConfirmOpen(true)}
        disabled={submitting || contribution <= 0}
      />
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm opacity-80">{label}</span>
      {children}
    </label>
  );
}
