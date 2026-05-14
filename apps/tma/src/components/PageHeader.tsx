'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTonAddress } from '@tonconnect/ui-react';
import { Logo } from './Logo';
import { shortAddress } from '../lib/format';

export function PageHeader({
  title,
  subtitle,
  showIcon = true,
}: {
  title: string;
  subtitle?: ReactNode;
  showIcon?: boolean;
}) {
  const router = useRouter();
  const address = useTonAddress();

  return (
    <header className="px-4 pt-6 pb-4 border-b border-black/5">
      <div className="flex items-center gap-2">
        {showIcon && <Logo variant="icon" size={28} />}
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
          {title}
        </h1>
        <button
          type="button"
          aria-label="Wallet"
          onClick={() => router.push('/wallet')}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1h1a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm15 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
              fill="currentColor"
            />
          </svg>
          {address ? shortAddress(address, 4, 4) : 'Connect'}
        </button>
      </div>
      {subtitle ? <p className="text-sm opacity-70 mt-1">{subtitle}</p> : null}
    </header>
  );
}
