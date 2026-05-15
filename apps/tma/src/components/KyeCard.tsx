import Link from 'next/link';
import type { ApiKye } from '../lib/api';
import type { Strings } from '../i18n';
import { StatusBadge } from './StatusBadge';
import { Countdown } from './Countdown';
import { fmtUSDT } from '../lib/format';

export function KyeCard({
  kye,
  strings,
  deleting = false,
}: {
  kye: ApiKye;
  strings: Strings;
  /** Locally marked as in-flight EmergencyCancel — show as disabled "deleting" row. */
  deleting?: boolean;
}) {
  const statusLabel = strings.status[kye.status];
  const contributionBig = BigInt(kye.params.contribution);
  const cardClass =
    'block rounded-2xl border border-black/5 bg-[var(--color-secondary-bg)] p-4 shadow-sm transition';

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-base leading-tight">{kye.name}</h3>
        {deleting ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
            {strings.home.deleting}
          </span>
        ) : (
          <StatusBadge status={kye.status} label={statusLabel} />
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs opacity-80">
        <dt>{strings.home.members}</dt>
        <dd className="text-right tabular-nums">
          {kye.memberCount}/{kye.params.N}
        </dd>
        <dt>{strings.home.contribution}</dt>
        <dd className="text-right tabular-nums">{fmtUSDT(contributionBig)} USDC</dd>
        {kye.nextRoundAt ? (
          <>
            <dt>{strings.home.nextRoundIn}</dt>
            <dd className="text-right tabular-nums">
              <Countdown targetUnixSec={kye.nextRoundAt} />
            </dd>
          </>
        ) : null}
      </dl>
    </>
  );

  if (deleting) {
    return (
      <div
        data-testid="kye-card"
        data-status={kye.status}
        aria-disabled="true"
        className={`${cardClass} pointer-events-none cursor-not-allowed opacity-60`}
      >
        {body}
      </div>
    );
  }
  return (
    <Link
      href={`/kye/${kye.contractAddress}`}
      data-testid="kye-card"
      data-status={kye.status}
      className={`${cardClass} hover:shadow`}
    >
      {body}
    </Link>
  );
}
