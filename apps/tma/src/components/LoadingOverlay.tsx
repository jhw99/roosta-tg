'use client';

/**
 * Full-screen blocking overlay with a spinner and a contextual message.
 * Use it for any action that does an off-chain round-trip the user shouldn't
 * race with (relay, top-up, withdraw, etc.).
 */
export function LoadingOverlay({
  open,
  message,
  hint,
}: {
  open: boolean;
  message: string;
  hint?: string;
}) {
  if (!open) return null;
  return (
    <div
      role="alertdialog"
      aria-busy="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="w-full max-w-xs rounded-2xl bg-[var(--color-bg)] p-5 shadow-xl text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent" />
        <p className="mt-4 text-sm font-medium">{message}</p>
        {hint && <p className="mt-1 text-xs opacity-60">{hint}</p>}
      </div>
    </div>
  );
}
