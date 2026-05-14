'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Address, toNano } from '@ton/core';
import { buildJoinKyeBody } from '@roosta/shared/contractMessages';
import { PageHeader } from '../../../components/PageHeader';
import { PayoutTable } from '../../../components/PayoutTable';
import { WarningCallout } from '../../../components/WarningCallout';
import { MainButtonShim } from '../../../components/MainButtonShim';
import { useStrings } from '../../../hooks/useStrings';
import { useVault } from '../../../hooks/useVault';
import { api, type ApiKye, type ApiMember } from '../../../lib/api';
import { computeWarnings } from '../../../lib/warnings';
import { signAndRelay } from '../../../lib/vault';
import { fmtUSDT, shortAddress } from '../../../lib/format';

// Gas-only forward for the JoinKye message (the contract takes no value here).
const JOIN_FORWARD_TON = toNano('0.02');

export default function JoinKye({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const s = useStrings();
  const router = useRouter();
  const vault = useVault();

  const [kye, setKye] = useState<ApiKye | null>(null);
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [consent, setConsent] = useState(false);
  const [joining, setJoining] = useState(false);

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

  const warnings = useMemo(() => {
    if (!kye) return [];
    return computeWarnings(
      {
        N: kye.params.N,
        feeBps: kye.params.feeRateBps,
        alphaMaxBps: kye.params.alphaMaxBps,
        roundIntervalWeeks: Math.round(kye.params.roundIntervalSec / (7 * 24 * 3600)),
      },
      s,
    );
  }, [kye, s]);

  const takenSlots = useMemo(() => members.map((m) => m.orderNum).filter((n) => n > 0), [members]);

  const canJoin =
    !!kye && selected != null && !takenSlots.includes(selected) && (warnings.length === 0 || consent);

  const submit = useCallback(async () => {
    if (!kye || selected == null) return;
    if (!vault.ready || !vault.vaultAddress) {
      setError('Activate your gasless vault first (from the home screen).');
      return;
    }
    setJoining(true);
    setError(null);
    try {
      await api.joinKye(address, { orderNum: selected });
      // The vault is the on-chain member. Sign the JoinKye intent with the
      // session key and relay it — no wallet popup, no gas.
      await signAndRelay({
        vaultAddress: vault.vaultAddress,
        target: Address.parse(kye.contractAddress),
        amount: JOIN_FORWARD_TON,
        body: buildJoinKyeBody(selected),
      });
      router.push(`/kye/${kye.contractAddress}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : s.common.error);
    } finally {
      setJoining(false);
    }
  }, [kye, selected, address, vault.ready, vault.vaultAddress, router, s.common.error]);

  if (loading) {
    return (
      <main>
        <PageHeader title={s.join.title} subtitle={shortAddress(address)} />
        <p className="p-4 opacity-70">{s.common.loading}</p>
      </main>
    );
  }

  if (!kye) {
    return (
      <main>
        <PageHeader title={s.join.title} subtitle={shortAddress(address)} />
        <p className="p-4 text-red-700">{error ?? s.common.error}</p>
      </main>
    );
  }

  const contributionBig = BigInt(kye.params.contribution);
  const totalDurationSec = kye.params.roundIntervalSec * kye.params.N;
  const totalDurationDays = Math.round(totalDurationSec / 86400);

  return (
    <main>
      <PageHeader title={kye.name} subtitle={s.join.title} />

      <section className="p-4 space-y-3">
        <Info label={s.join.organizer}>
          {kye.organizerHandle ? `@${kye.organizerHandle}` : ''}{' '}
          <span className="opacity-60 text-xs">{shortAddress(kye.organizerWallet ?? '')}</span>
        </Info>
        <Info label={s.join.contractAddress}>{shortAddress(kye.contractAddress)}</Info>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Stat label={s.home.members} value={`${kye.memberCount}/${kye.params.N}`} />
          <Stat label={s.home.contribution} value={`${fmtUSDT(contributionBig)} USDT`} />
          <Stat
            label={s.create.interval}
            value={s.create.weeks(Math.round(kye.params.roundIntervalSec / (7 * 24 * 3600)))}
          />
          <Stat label={s.join.duration} value={`${totalDurationDays}d`} />
          <Stat label={s.create.feeRate} value={`${(kye.params.feeRateBps / 100).toFixed(2)}%`} />
          <Stat
            label={s.create.alphaMax}
            value={`${(kye.params.alphaMaxBps / 100).toFixed(2)}%`}
          />
        </div>
        <div className="rounded-xl bg-[var(--color-secondary-bg)] p-3 text-xs space-y-1">
          <p>
            {s.join.fee}: {(kye.params.feeRateBps / 100).toFixed(2)}%
          </p>
          <p className="opacity-70">
            {s.join.platformShare} · {s.join.organizerShare}{' '}
            {((kye.params.feeRateBps - 50) / 100).toFixed(2)}%
          </p>
        </div>
      </section>

      {warnings.length > 0 && (
        <section className="px-4 pb-2">
          <WarningCallout items={warnings} />
        </section>
      )}

      <section className="px-4 pb-2">
        <h2 className="mb-2 font-semibold text-sm">{s.join.pickSlot}</h2>
        <PayoutTable
          N={kye.params.N}
          contribution={contributionBig}
          feeBps={kye.params.feeRateBps}
          alphaMaxBps={kye.params.alphaMaxBps}
          takenSlots={takenSlots}
          selectedSlot={selected}
          onPick={(slot) => setSelected(slot)}
        />
      </section>

      {warnings.length > 0 && (
        <section className="px-4 pb-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>{s.join.consent}</span>
          </label>
        </section>
      )}

      {error && (
        <section className="px-4 pb-2">
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        </section>
      )}

      <div className="pb-24" />

      <MainButtonShim
        text={joining ? s.join.joining : s.join.join}
        onClick={() => void submit()}
        disabled={!canJoin || joining}
      />
    </main>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm">
      <span className="opacity-60">{label}: </span>
      <span>{children}</span>
    </div>
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
