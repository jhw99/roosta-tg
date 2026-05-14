'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../components/PageHeader';
import { KyeCard } from '../components/KyeCard';
import { MainButtonShim } from '../components/MainButtonShim';
import { api, type ApiKye } from '../lib/api';
import { useStrings } from '../hooks/useStrings';
import { useAppStore } from '../store';

export default function Home() {
  const s = useStrings();
  const router = useRouter();
  const setKyes = useAppStore((st) => st.setKyes);
  const setUser = useAppStore((st) => st.setUser);
  const kyes = useAppStore((st) => st.kyes);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pullStartY, setPullStartY] = useState<number | null>(null);
  const [pullDelta, setPullDelta] = useState(0);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const data = await api.me();
        setUser(data.user);
        setKyes(data.kyes as ApiKye[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : s.common.error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [setKyes, setUser, s.common.error],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) setPullStartY(e.touches[0].clientY);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (pullStartY != null) {
      const delta = e.touches[0].clientY - pullStartY;
      if (delta > 0) setPullDelta(Math.min(delta, 80));
    }
  };
  const onTouchEnd = () => {
    if (pullDelta > 60) void load('refresh');
    setPullStartY(null);
    setPullDelta(0);
  };

  const goCreate = useCallback(() => router.push('/create'), [router]);

  return (
    <main
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ paddingTop: pullDelta }}
    >
      <PageHeader title={s.home.title} subtitle={s.tagline} />
      {refreshing && <p className="px-4 py-2 text-xs opacity-70">{s.home.refreshing}</p>}
      <section className="p-4 space-y-3 pb-24">
        {loading && <p className="opacity-70">{s.common.loading}</p>}
        {!loading && error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            {error}
            <button onClick={() => void load('initial')} className="ml-2 underline" type="button">
              {s.common.retry}
            </button>
          </div>
        )}
        {!loading && !error && kyes.length === 0 && (
          <div className="rounded-2xl border border-black/5 bg-[var(--color-secondary-bg)] p-6 text-center">
            <p className="opacity-70">{s.home.empty}</p>
            <button
              type="button"
              onClick={goCreate}
              className="mt-4 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
            >
              {s.home.cta}
            </button>
          </div>
        )}
        {kyes.map((k) => (
          <KyeCard key={k.id} kye={k} strings={s} />
        ))}
      </section>
      <MainButtonShim text={s.home.mainButton} onClick={goCreate} />
    </main>
  );
}
