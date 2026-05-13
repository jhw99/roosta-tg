import type { WarningItem } from '../lib/warnings';

export function WarningCallout({ items }: { items: WarningItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 space-y-1">
      {items.map((w) => (
        <p key={w.id} data-warning={w.id} className="flex gap-2 items-start">
          <span aria-hidden>⚠️</span>
          <span>{w.message}</span>
        </p>
      ))}
    </div>
  );
}
