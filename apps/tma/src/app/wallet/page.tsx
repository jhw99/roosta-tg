'use client';

import { useCallback, useEffect, useState } from 'react';
import { Address, beginCell, toNano } from '@ton/core';
import { TonConnectButton, useTonConnectUI } from '@tonconnect/ui-react';
import { PageHeader } from '../../components/PageHeader';
import { LoadingOverlay } from '../../components/LoadingOverlay';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { useStrings } from '../../hooks/useStrings';
import { useVault } from '../../hooks/useVault';
import { signAndRelay, VAULT_MIN_GAS } from '../../lib/vault';
import { api } from '../../lib/api';
import { useAppStore } from '../../store';
import { fmtUSDC, shortAddress } from '../../lib/format';

// 6-dec scale: 1 TON nano = 0.001 USDC display; the contract treats native TON
// nano-units as the contribution amount, so we present them as USDC at 6 dec.
const SCALE = 1_000_000n;

function nanoToUsdc(nano: bigint, digits = 2): string { return fmtUSDC(nano, digits); }
function usdcToNano(s: string): bigint {
  const [whole, frac = ''] = s.replace(/[, ]/g, '').split('.');
  const wholeBig = BigInt(whole || '0') * SCALE;
  const fracPadded = (frac + '000000').slice(0, 6);
  return wholeBig + BigInt(fracPadded || '0');
}

// We deliberately do NOT read the wallet's raw on-chain TON balance: testnet
// wallets routinely have stray TON from external faucets (Tonkeeper, @testgiver_
// ton_bot) which would inflate the displayed "USDC" figure. We show only the
// amount the backend has credited via /me/faucet — see user.testUsdcBalance.
// On mainnet this same field stays at 0 and the UI should read the real USDC
// jetton balance instead (TODO once jetton wiring lands).

export default function Wallet() {
  const s = useStrings();
  const [tonConnectUI] = useTonConnectUI();
  const vault = useVault();
  const user = useAppStore((st) => st.user);
  const setUser = useAppStore((st) => st.setUser);

  const [sheet, setSheet] = useState<null | 'deposit' | 'withdraw'>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState<null | 'deposit' | 'withdraw' | 'faucet'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmFaucet, setConfirmFaucet] = useState(false);

  const ownerBalance: bigint | null = user?.testUsdcBalance != null
    ? BigInt(user.testUsdcBalance)
    : null;

  const vaultBalance = vault.state?.balance ?? 0n;
  const withdrawableNano = vaultBalance > VAULT_MIN_GAS ? vaultBalance - VAULT_MIN_GAS : 0n;
  const faucetClaimed = !!user?.faucetClaimedAt;

  const closeSheet = () => { setSheet(null); setAmount(''); setErr(null); setMsg(null); };

  const onDeposit = useCallback(async () => {
    setBusy('deposit'); setErr(null); setMsg(null);
    try {
      await vault.topUp(amount);
      // The deposit is a TonConnect-signed tx the backend cannot observe.
      // Sync the server-tracked test USDC balance with the same amount so
      // the wallet line stays accurate.
      const nano = usdcToNano(amount);
      try {
        const res = await api.notifyDeposit(nano);
        if (user) setUser({ ...user, testUsdcBalance: res.testUsdcBalance });
      } catch { /* non-fatal: chain truth still wins */ }
      setMsg(s.wallet.depositDone);
      closeSheet();
      await vault.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : s.common.error);
    } finally {
      setBusy(null);
    }
  }, [vault, amount, user, setUser, s]);

  const onWithdraw = useCallback(async () => {
    if (!vault.vaultAddress || !vault.ownerAddress) {
      setErr(s.vault.notActivated); return;
    }
    const nano = usdcToNano(amount);
    if (nano <= 0n) { setErr(s.wallet.withdrawNothing); return; }
    if (nano > withdrawableNano) { setErr(s.wallet.amountExceeds); return; }
    setBusy('withdraw'); setErr(null); setMsg(null);
    try {
      await signAndRelay({
        vaultAddress: vault.vaultAddress,
        target: Address.parse(vault.ownerAddress),
        amount: nano,
        body: beginCell().endCell(),
      });
      setMsg(s.wallet.withdrawDone);
      closeSheet();
      await vault.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : s.common.error);
    } finally {
      setBusy(null);
    }
  }, [vault, amount, withdrawableNano, s]);

  const onClaimFaucet = useCallback(async () => {
    setConfirmFaucet(false);
    setBusy('faucet'); setErr(null); setMsg(null);
    try {
      const res = await api.faucet();
      if (user) {
        setUser({
          ...user,
          faucetClaimedAt: new Date().toISOString(),
          testUsdcBalance: res.testUsdcBalance ?? user.testUsdcBalance,
        });
      }
      setMsg(s.wallet.faucetDone);
    } catch (e) {
      setErr(e instanceof Error ? e.message : s.common.error);
    } finally {
      setBusy(null);
    }
  }, [user, setUser, s]);

  return (
    <main>
      <PageHeader title={s.wallet.title} subtitle={s.wallet.subtitle} />
      <section className="p-4 space-y-4">
        {/* Owner wallet */}
        <div>
          <p className="mb-2 text-xs opacity-60">{s.wallet.ownerWallet}</p>
          <TonConnectButton />
          {vault.ownerAddress && (
            <p className="mt-2 text-xs opacity-60">
              {s.wallet.balance}:{' '}
              <span className="font-medium tabular-nums">
                {ownerBalance == null ? '—' : `${nanoToUsdc(ownerBalance)} USDC`}
              </span>
            </p>
          )}
        </div>

        {!vault.ownerAddress ? (
          <p className="text-sm opacity-70">{s.wallet.connectPrompt}</p>
        ) : (
          <>
            {/* Vault summary */}
            <div className="rounded-2xl border border-black/5 bg-[var(--color-secondary-bg)] p-4">
              <p className="text-xs opacity-60">{s.vault.vaultBalance}</p>
              <p className="text-2xl font-bold tabular-nums">
                {vault.ready ? nanoToUsdc(vaultBalance) : '0.00'} USDC
              </p>
              {vault.vaultAddress && (
                <p className="mt-1 text-xs opacity-50">
                  {shortAddress(vault.vaultAddress, 6, 6)}
                </p>
              )}
              {!vault.ready && (
                <p className="mt-2 text-xs opacity-70">{s.vault.activateHint}</p>
              )}
            </div>

            {/* Deposit / Withdraw */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setSheet('deposit'); setAmount(''); setErr(null); }}
                className="rounded-2xl bg-[var(--color-primary)] py-4 font-semibold text-white"
              >
                {s.wallet.deposit}
              </button>
              <button
                type="button"
                onClick={() => { setSheet('withdraw'); setAmount(''); setErr(null); }}
                disabled={!vault.ready || withdrawableNano <= 0n}
                className="rounded-2xl border-2 border-[var(--color-primary)] py-4 font-semibold text-[var(--color-primary)] disabled:opacity-40"
              >
                {s.wallet.withdraw}
              </button>
            </div>

            {/* Testnet faucet */}
            <div className="rounded-2xl border border-dashed border-black/15 p-4 text-sm">
              <p className="font-medium">{s.wallet.faucetTitle}</p>
              <p className="mt-1 text-xs opacity-60">{s.wallet.faucetBody}</p>
              <button
                type="button"
                onClick={() => setConfirmFaucet(true)}
                disabled={faucetClaimed || busy === 'faucet'}
                className="mt-3 w-full rounded-xl bg-amber-500 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {faucetClaimed ? s.wallet.faucetClaimed : s.wallet.faucetClaim}
              </button>
            </div>

            <button
              type="button"
              onClick={() => void tonConnectUI.disconnect()}
              className="w-full rounded-xl border border-red-300 py-2 text-sm text-red-700"
            >
              {s.wallet.disconnect}
            </button>
          </>
        )}

        {msg && <p className="text-xs text-green-700">{msg}</p>}
        {err && <p className="text-xs text-red-600">{err}</p>}
      </section>

      {/* Deposit sheet */}
      {sheet === 'deposit' && (
        <div role="dialog" aria-modal="true"
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl bg-[var(--color-bg)] p-4 shadow-xl sm:rounded-2xl">
            <h2 className="text-lg font-semibold">{s.wallet.deposit}</h2>
            <p className="mt-1 text-xs opacity-60">
              {s.wallet.availableInWallet}:{' '}
              <span className="font-medium">{ownerBalance == null ? '—' : nanoToUsdc(ownerBalance)} USDC</span>
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number" min="0" step="any" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm"
              />
              <span className="text-sm opacity-60">USDC</span>
              <button type="button"
                onClick={() => { if (ownerBalance) setAmount(nanoToUsdc(ownerBalance - toNano('0.05'), 6)); }}
                className="rounded-lg border border-black/10 px-2 py-1 text-xs">
                {s.wallet.max}
              </button>
            </div>
            {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={closeSheet} disabled={busy !== null}
                className="flex-1 rounded-xl border border-black/10 py-2 text-sm">
                {s.common.cancel}
              </button>
              <button type="button" onClick={() => void onDeposit()}
                disabled={!amount || busy !== null}
                className="flex-1 rounded-xl bg-[var(--color-primary)] py-2 text-sm font-medium text-white disabled:opacity-60">
                {busy === 'deposit' ? s.vault.relaying : s.wallet.deposit}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw sheet */}
      {sheet === 'withdraw' && (
        <div role="dialog" aria-modal="true"
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl bg-[var(--color-bg)] p-4 shadow-xl sm:rounded-2xl">
            <h2 className="text-lg font-semibold">{s.wallet.withdraw}</h2>
            <p className="mt-1 text-xs opacity-60">
              {s.wallet.toMyWallet} · {s.wallet.withdrawable}:{' '}
              <span className="font-medium">{nanoToUsdc(withdrawableNano)} USDC</span>
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number" min="0" step="any" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm"
              />
              <span className="text-sm opacity-60">USDC</span>
              <button type="button"
                onClick={() => setAmount(nanoToUsdc(withdrawableNano, 6))}
                className="rounded-lg border border-black/10 px-2 py-1 text-xs">
                {s.wallet.max}
              </button>
            </div>
            {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={closeSheet} disabled={busy !== null}
                className="flex-1 rounded-xl border border-black/10 py-2 text-sm">
                {s.common.cancel}
              </button>
              <button type="button" onClick={() => void onWithdraw()}
                disabled={!amount || busy !== null}
                className="flex-1 rounded-xl bg-[var(--color-primary)] py-2 text-sm font-medium text-white disabled:opacity-60">
                {busy === 'withdraw' ? s.vault.relaying : s.wallet.withdraw}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationDialog
        open={confirmFaucet}
        title={s.wallet.faucetTitle}
        confirmLabel={s.wallet.faucetClaim}
        cancelLabel={s.common.cancel}
        onCancel={() => setConfirmFaucet(false)}
        onConfirm={() => void onClaimFaucet()}
      >
        {s.wallet.faucetBody}
      </ConfirmationDialog>

      <LoadingOverlay
        open={busy !== null}
        message={busy === 'deposit' ? s.wallet.deposit : busy === 'withdraw' ? s.wallet.withdraw : s.wallet.faucetClaim}
        hint={s.common.loadingHint}
      />
    </main>
  );
}
