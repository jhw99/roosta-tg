'use client';

import { useCallback, useState } from 'react';
import { Address, beginCell, toNano } from '@ton/core';
import { TonConnectButton, useTonConnectUI } from '@tonconnect/ui-react';
import { PageHeader } from '../../components/PageHeader';
import { LoadingOverlay } from '../../components/LoadingOverlay';
import { useStrings } from '../../hooks/useStrings';
import { useVault } from '../../hooks/useVault';
import { signAndRelay, VAULT_MIN_GAS } from '../../lib/vault';

function fmtTon(nano: bigint): string {
  const whole = nano / 1_000_000_000n;
  const frac = (nano % 1_000_000_000n).toString().padStart(9, '0').slice(0, 3);
  return `${whole}.${frac}`;
}

export default function Wallet() {
  const s = useStrings();
  const [tonConnectUI] = useTonConnectUI();
  const vault = useVault();

  const [topUpAmount, setTopUpAmount] = useState('1');
  const [withdrawTo, setWithdrawTo] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [busy, setBusy] = useState<null | 'topup' | 'withdraw' | 'sweep'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const balance = vault.state?.balance ?? 0n;
  const withdrawable = balance > VAULT_MIN_GAS ? balance - VAULT_MIN_GAS : 0n;

  const onTopUp = useCallback(async () => {
    setBusy('topup');
    setErr(null);
    setMsg(null);
    try {
      await vault.topUp(topUpAmount);
      setMsg(s.wallet.topUpDone);
    } catch (e) {
      setErr(e instanceof Error ? e.message : s.common.error);
    } finally {
      setBusy(null);
    }
  }, [vault, topUpAmount, s]);

  // Gasless withdrawal: a signed intent forwarding funds from the vault to any
  // address. For "sweep", `dest` is the connected owner wallet ("cash out").
  const doWithdraw = useCallback(
    async (dest: string, amountNano: bigint, kind: 'withdraw' | 'sweep') => {
      if (!vault.vaultAddress) {
        setErr(s.vault.notActivated);
        return;
      }
      if (amountNano <= 0n) {
        setErr(s.wallet.withdrawNothing);
        return;
      }
      setBusy(kind);
      setErr(null);
      setMsg(null);
      try {
        await signAndRelay({
          vaultAddress: vault.vaultAddress,
          target: Address.parse(dest),
          amount: amountNano,
          body: beginCell().endCell(), // plain transfer, no body
        });
        setMsg(s.wallet.withdrawDone);
        await vault.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : s.common.error);
      } finally {
        setBusy(null);
      }
    },
    [vault, s],
  );

  return (
    <main>
      <PageHeader title={s.wallet.title} subtitle={s.wallet.subtitle} />
      <section className="p-4 space-y-4">
        {/* Owner wallet (TonConnect) */}
        <div>
          <p className="mb-2 text-xs opacity-60">{s.wallet.ownerWallet}</p>
          <TonConnectButton />
        </div>

        {/* Vault — the gasless proxy wallet */}
        {!vault.ownerAddress ? (
          <p className="text-sm opacity-70">{s.wallet.connectPrompt}</p>
        ) : !vault.ready ? (
          <div className="rounded-2xl border border-black/5 bg-[var(--color-secondary-bg)] p-4 text-sm">
            <p className="font-medium">{s.vault.notActivated}</p>
            <p className="mt-1 text-xs opacity-70">{s.vault.activateHint}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-black/5 bg-[var(--color-secondary-bg)] p-4 space-y-4 text-sm">
            <div>
              <p className="text-xs opacity-60">{s.vault.vaultBalance}</p>
              <p className="text-2xl font-bold tabular-nums">{fmtTon(balance)} TON</p>
              <p className="break-all text-xs opacity-50">{vault.vaultAddress}</p>
            </div>

            {/* Top up */}
            <div className="border-t border-black/5 pt-3">
              <p className="mb-2 text-xs opacity-60">{s.vault.topUp}</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="w-24 rounded-lg border border-black/10 bg-transparent px-2 py-2 text-sm"
                />
                <span className="self-center text-sm opacity-60">TON</span>
                <button
                  type="button"
                  onClick={onTopUp}
                  disabled={busy !== null}
                  className="ml-auto rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busy === 'topup' ? s.vault.relaying : s.vault.topUp}
                </button>
              </div>
            </div>

            {/* Withdraw to any address */}
            <div className="border-t border-black/5 pt-3 space-y-2">
              <p className="text-xs opacity-60">{s.wallet.withdrawTitle}</p>
              <input
                type="text"
                placeholder={s.wallet.withdrawToPlaceholder}
                value={withdrawTo}
                onChange={(e) => setWithdrawTo(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-transparent px-2 py-2 text-xs"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0.0"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-24 rounded-lg border border-black/10 bg-transparent px-2 py-2 text-sm"
                />
                <span className="self-center text-sm opacity-60">TON</span>
                <button
                  type="button"
                  onClick={() =>
                    doWithdraw(withdrawTo.trim(), toNano(withdrawAmount || '0'), 'withdraw')
                  }
                  disabled={busy !== null || !withdrawTo.trim() || !withdrawAmount}
                  className="ml-auto rounded-xl border border-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] disabled:opacity-40"
                >
                  {busy === 'withdraw' ? s.vault.relaying : s.wallet.withdraw}
                </button>
              </div>
              <p className="text-xs opacity-50">
                {s.wallet.withdrawable}: {fmtTon(withdrawable)} TON
              </p>
            </div>

            {/* Sweep everything back to the connected wallet */}
            <button
              type="button"
              onClick={() => doWithdraw(vault.ownerAddress, withdrawable, 'sweep')}
              disabled={busy !== null || withdrawable <= 0n}
              className="w-full rounded-xl border border-black/10 py-2 text-sm disabled:opacity-40"
            >
              {busy === 'sweep' ? s.vault.relaying : s.wallet.sweepToOwner}
            </button>

            <button
              type="button"
              onClick={() => void tonConnectUI.disconnect()}
              className="w-full rounded-xl border border-red-300 py-2 text-sm text-red-700"
            >
              {s.wallet.disconnect}
            </button>
          </div>
        )}

        {msg && <p className="text-xs text-green-700">{msg}</p>}
        {err && <p className="text-xs text-red-600">{err}</p>}
      </section>
      <LoadingOverlay
        open={busy !== null}
        message={
          busy === 'topup'
            ? s.vault.topUp
            : busy === 'sweep'
              ? s.wallet.sweepToOwner
              : s.wallet.withdraw
        }
        hint={s.common.loadingHint}
      />
    </main>
  );
}
