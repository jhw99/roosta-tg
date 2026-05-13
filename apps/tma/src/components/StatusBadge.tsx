import type { KyeStatus } from '@roosta/shared';

// Roosta brand-aligned status colors.
// - active uses Roosta orange (brand primary)
// - completed = success green
// - cancelled = error red
// - created   = neutral
const COLORS: Record<KyeStatus, string> = {
  created: 'bg-gray-200 text-gray-800',
  active: 'bg-[var(--color-roosta-100)] text-[var(--color-roosta-800)]',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status, label }: { status: KyeStatus; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[status]}`}
      data-status={status}
    >
      {label}
    </span>
  );
}
