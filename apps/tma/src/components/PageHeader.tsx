import type { ReactNode } from 'react';
import { Logo } from './Logo';

export function PageHeader({
  title,
  subtitle,
  showIcon = true,
}: {
  title: string;
  subtitle?: ReactNode;
  showIcon?: boolean;
}) {
  return (
    <header className="px-4 pt-6 pb-4 border-b border-black/5">
      <div className="flex items-center gap-2">
        {showIcon && <Logo variant="icon" size={28} />}
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
          {title}
        </h1>
      </div>
      {subtitle ? <p className="text-sm opacity-70 mt-1">{subtitle}</p> : null}
    </header>
  );
}
