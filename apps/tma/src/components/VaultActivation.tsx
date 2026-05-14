'use client';

import { useState } from 'react';
import { TonConnectButton } from '@tonconnect/ui-react';
import { useStrings } from '../hooks/useStrings';
import type { UseVault } from '../hooks/useVault';

const FUNDING_PRESETS = ['2', '5', '10'];

/**
 * One-time vault activation banner. Shown on the home screen until the user's
 * gasless proxy vault is deployed. After this single transaction every Roosta
 * action is gasless. See docs/GASLESS_ARCHITECTURE.md.
 */
export function VaultActivation({ vault }: { vault: UseVault }) {
  const s = useStrings();
  const [funding, setFunding] = useState(FUNDING_PRESETS[1]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onActivate = async () => {
    setBusy(true);
    setErr(null);
    try {
      await vault.activate(funding);
    } catch (e) {
      setErr(e instanceof Error ? e.message : s.common.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="p-4">
      <div className="rounded-2xl border border-black/5 bg-[var(--color-secondary-bg)] p-6 space-y-4 text-center">
        <h2 className="text-lg font-bold text-[var(--color-primary)]">{s.vault.activateTitle}</h2>
        <p className="text-sm font-medium">{s.vault.activateTagline}</p>
        <p className="text-sm leading-relaxed opacity-70">{s.vault.activateBody}</p>

        {!vault.ownerAddress ? (
          <div className="flex justify-center pt-1">
            <TonConnectButton />
          </div>
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs opacity-60">{s.vault.fundingAmount}</p>
              <div className="flex gap-2">
                {FUNDING_PRESETS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setFunding(amt)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-sm ${
                      funding === amt
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                        : 'border-black/10'
                    }`}
                  >
                    {amt} TON
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={onActivate}
              disabled={busy}
              className="w-full rounded-xl bg-[var(--color-primary)] py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? s.vault.activating : s.vault.activateCta}
            </button>
            <p className="text-xs opacity-50">{s.vault.activateHint}</p>
          </>
        )}
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </section>
  );
}
