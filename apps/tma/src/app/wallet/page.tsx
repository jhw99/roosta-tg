'use client';

import { useEffect, useState } from 'react';
import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { PageHeader } from '../../components/PageHeader';
import { useStrings } from '../../hooks/useStrings';
import { shortAddress } from '../../lib/format';

interface TonBalanceResp {
  ok?: boolean;
  result?: string;
}

async function fetchTonBalance(address: string): Promise<bigint | null> {
  try {
    const url = `https://toncenter.com/api/v2/getAddressBalance?address=${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as TonBalanceResp;
    if (data.ok && typeof data.result === 'string') return BigInt(data.result);
  } catch {
    // ignore
  }
  return null;
}

function fmtTon(nano: bigint): string {
  const whole = nano / 1_000_000_000n;
  const frac = nano % 1_000_000_000n;
  return `${whole}.${frac.toString().padStart(9, '0').slice(0, 3)} TON`;
}

export default function Wallet() {
  const s = useStrings();
  const [tonConnectUI] = useTonConnectUI();
  const address = useTonAddress();
  const [balance, setBalance] = useState<bigint | null>(null);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    void fetchTonBalance(address).then((b) => {
      if (!cancelled) setBalance(b);
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return (
    <main>
      <PageHeader title={s.wallet.title} subtitle={s.wallet.subtitle} />
      <section className="p-4 space-y-4">
        <div>
          <TonConnectButton />
        </div>

        {address && (
          <div className="rounded-2xl border border-black/5 bg-[var(--color-secondary-bg)] p-4 space-y-2 text-sm">
            <div>
              <p className="text-xs opacity-60">{s.wallet.address}</p>
              <p className="break-all font-medium">{address}</p>
              <p className="text-xs opacity-60">{shortAddress(address, 6, 6)}</p>
            </div>
            <div>
              <p className="text-xs opacity-60">{s.wallet.balance}</p>
              <p className="text-lg font-semibold tabular-nums">
                {balance == null ? '—' : fmtTon(balance)}
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => void tonConnectUI.disconnect()}
                className="flex-1 rounded-xl border border-red-300 py-2 text-sm text-red-700"
              >
                {s.wallet.disconnect}
              </button>
              <button
                type="button"
                onClick={() => void tonConnectUI.openModal()}
                className="flex-1 rounded-xl border border-black/10 py-2 text-sm"
              >
                {s.wallet.rePair}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
