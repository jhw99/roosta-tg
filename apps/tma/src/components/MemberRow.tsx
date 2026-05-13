import type { ApiMember } from '../lib/api';
import type { Strings } from '../i18n';
import { shortAddress } from '../lib/format';

export function MemberRow({ member, strings }: { member: ApiMember; strings: Strings }) {
  const statusKey = member.currentRoundStatus ?? 'pending';
  const statusLabel =
    statusKey === 'paid'
      ? strings.kye.paid
      : statusKey === 'defaulted'
        ? strings.kye.defaulted
        : strings.kye.pending;

  const statusClass =
    statusKey === 'paid'
      ? 'text-green-700 bg-green-100'
      : statusKey === 'defaulted'
        ? 'text-red-700 bg-red-100'
        : 'text-gray-700 bg-gray-100';

  return (
    <li
      data-testid="member-row"
      data-me={member.isMe ? 'true' : 'false'}
      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
        member.isMe
          ? 'bg-[var(--color-roosta-50)] dark:bg-[var(--color-roosta-900)]/20 border border-[var(--color-roosta-200)] dark:border-[var(--color-roosta-700)]/40'
          : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/10 text-xs font-medium">
          {member.orderNum}
        </span>
        <div className="min-w-0">
          <p className="text-sm truncate">
            {member.handle ? `@${member.handle}` : shortAddress(member.walletAddress)}
            {member.isMe && (
              <span className="ml-2 text-xs opacity-70">({strings.kye.you})</span>
            )}
          </p>
          <p className="text-xs opacity-60 truncate">{shortAddress(member.walletAddress)}</p>
        </div>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
        {statusLabel}
      </span>
    </li>
  );
}
