'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Address, toNano } from '@ton/core';
import { buildJoinKyeBody } from '@roosta/shared/contractMessages';
import { PageHeader } from '../../../components/PageHeader';
import { PayoutTable } from '../../../components/PayoutTable';
import { WarningCallout } from '../../../components/WarningCallout';
import { MainButtonShim } from '../../../components/MainButtonShim';
import { LoadingOverlay } from '../../../components/LoadingOverlay';
import { useStrings } from '../../../hooks/useStrings';
import { useVault } from '../../../hooks/useVault';
import { api, ApiError, type ApiKye, type ApiMember } from '../../../lib/api';
import { useAppStore } from '../../../store';
import { computeWarnings } from '../../../lib/warnings';
import { signAndRelay } from '../../../lib/vault';
import { fmtUSDT, shortAddress } from '../../../lib/format';

type OnboardStep = null | 'faucet' | 'activate' | 'join';

// Poll testnet toncenter until the owner wallet has enough TON for the
// activation transaction. Needed because the faucet broadcast returns
// immediately but the drop takes ~10-30s to settle on chain.
async function waitForWalletFunded(address: string, minNano: bigint): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const url = `https://testnet.toncenter.com/api/v2/getAddressBalance?address=${encodeURIComponent(address)}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as { ok?: boolean; result?: string };
      if (data.ok && data.result && BigInt(data.result) >= minNano) return true;
    } catch { /* keep polling */ }
  }
  return false;
}

// Gas-only forward for the JoinKye message (the contract takes no value here).
const JOIN_FORWARD_TON = toNano('0.02');
// One-time vault activation funding when a user joins their first circle:
// covers the vault deploy + storage reserve + the join message, with headroom
// for an upcoming contribution. Larger deposits go through the Wallet page.
const JOIN_ACTIVATION_FUNDING_TON = '0.3';

export default function JoinKye({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const s = useStrings();
  const router = useRouter();
  const vault = useVault();
  const user = useAppStore((st) => st.user);
  const setUser = useAppStore((st) => st.setUser);

  const [kye, setKye] = useState<ApiKye | null>(null);
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [consent, setConsent] = useState(false);
  const [joining, setJoining] = useState(false);
  const [onboardStep, setOnboardStep] = useState<OnboardStep>(null);

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
    if (!vault.ownerAddress) {
      setError(s.join.needsWallet);
      return;
    }
    setJoining(true);
    setError(null);
    try {
      // Onboarding step 1 — test USDC faucet (testnet only). Without TON in
      // the owner wallet, the vault activation tx below would bounce. On
      // mainnet the backend returns 403 and we skip; on testnet we wait until
      // the drop actually lands on chain before continuing.
      if (!user?.faucetClaimedAt) {
        setOnboardStep('faucet');
        try {
          const res = await api.faucet();
          if (user) {
            setUser({
              ...user,
              faucetClaimedAt: new Date().toISOString(),
              testUsdcBalance: res.testUsdcBalance ?? user.testUsdcBalance,
            });
          }
          await waitForWalletFunded(vault.ownerAddress, toNano(JOIN_ACTIVATION_FUNDING_TON));
        } catch (e) {
          // 403 = mainnet faucet disabled, that's fine. 409 = already claimed
          // (e.g. user previously claimed from another device) — also fine,
          // chain balance check below will catch a truly empty wallet.
          if (!(e instanceof ApiError && (e.status === 403 || e.status === 409))) throw e;
        }
      }

      // Onboarding step 2 — one-time gasless vault activation. Funds the
      // vault + deploys it via a single wallet-signed transaction.
      let vaultAddress = vault.vaultAddress;
      if (!vault.ready) {
        setOnboardStep('activate');
        await vault.activate(JOIN_ACTIVATION_FUNDING_TON);
        vaultAddress = vault.vaultAddress;
      }
      if (!vaultAddress) throw new Error('Vault not ready yet — try again in a moment.');

      // Onboarding step 3 — actual join. The vault is the on-chain member;
      // sign the JoinKye intent with the session key and relay it (no wallet
      // popup, no gas).
      setOnboardStep('join');
      await api.joinKye(address, { orderNum: selected });
      await signAndRelay({
        vaultAddress,
        target: Address.parse(kye.contractAddress),
        amount: JOIN_FORWARD_TON,
        body: buildJoinKyeBody(selected),
      });
      router.push(`/kye/${kye.contractAddress}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : s.common.error);
    } finally {
      setJoining(false);
      setOnboardStep(null);
    }
  }, [
    kye, selected, address, router, s.common.error, s.join.needsWallet,
    vault.ready, vault.vaultAddress, vault.ownerAddress, vault.activate,
    user, setUser,
  ]);

  const joiningMessage =
    onboardStep === 'faucet' ? s.join.onboardClaimingFaucet :
    onboardStep === 'activate' ? s.join.onboardActivatingVault :
    onboardStep === 'join' ? s.join.onboardSubmitting :
    s.join.joining;

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
          <Stat label={s.home.contribution} value={`${fmtUSDT(contributionBig)} USDC`} />
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
      <LoadingOverlay
        open={joining}
        message={joiningMessage}
        hint={s.common.loadingHint}
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
