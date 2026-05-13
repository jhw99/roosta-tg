'use client';

import { useEffect, useState } from 'react';
import { formatCountdown } from '../lib/format';

export function Countdown({
  targetUnixSec,
  className,
}: {
  targetUnixSec: number;
  className?: string;
}) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const left = targetUnixSec - now;
  return <span className={className}>{formatCountdown(left)}</span>;
}
