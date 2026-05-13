'use client';

import type { ReactNode } from 'react';

export function ConfirmationDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-t-2xl bg-[var(--color-bg)] p-4 shadow-xl sm:rounded-2xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children && <div className="mt-2 text-sm opacity-80">{children}</div>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-xl border border-black/10 py-2 text-sm"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl bg-[var(--color-primary)] py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
