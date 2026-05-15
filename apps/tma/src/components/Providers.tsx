'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { WalletSync } from './WalletSync';
import { getWebApp, getTelegramLanguage } from '../lib/webapp';
import { detectLang } from '../i18n';
import { useAppStore } from '../store';
import { markDemoMode, getDemoMe } from '../lib/demo';

const MANIFEST_URL =
  process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL ??
  'https://roosta-tg.vercel.app/tonconnect-manifest.json';

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const setLang = useAppStore((s) => s.setLang);
  const setHydrated = useAppStore((s) => s.setHydrated);
  const setUser = useAppStore((s) => s.setUser);
  const setKyes = useAppStore((s) => s.setKyes);
  const langOverride = useAppStore((s) => s.langOverride);

  useEffect(() => {
    const sp =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    if (sp?.get('demo') === '1') {
      markDemoMode();
      const empty = sp.get('seed') === 'empty';
      const { user, kyes } = getDemoMe(empty);
      setUser(user);
      setKyes(kyes);
      setLang(detectLang(user.language, null), false);
    } else {
      const tgLang = getTelegramLanguage();
      setLang(detectLang(tgLang, langOverride), false);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const wa = await getWebApp();
      if (!mounted || !wa) return;
      try {
        wa.ready();
        wa.expand();
        wa.setHeaderColor?.('secondary_bg_color');
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Bot deep-link routing. The invite share URL is
  //   https://t.me/RoostaApp_Bot/app?startapp=join_<contractAddress>
  // which lands the user on the mini app's home (/) with the start param
  // surfaced as `tgWebAppStartParam` (Telegram) or `?startapp=` (web). We
  // route on it so the recipient lands directly on the join page instead of
  // wondering where the Join button is.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pathname !== '/') return; // only handle on the home landing
    void (async () => {
      const sp = new URLSearchParams(window.location.search);
      let startParam =
        sp.get('tgWebAppStartParam') || sp.get('startapp') || sp.get('start_param') || '';
      // Telegram exposes the start_param on initDataUnsafe when launched via
      // bot deep-link inside the Telegram client.
      if (!startParam) {
        const wa = await getWebApp();
        const fromTg = (wa?.initDataUnsafe as { start_param?: string } | undefined)?.start_param;
        if (fromTg) startParam = fromTg;
      }
      if (startParam.startsWith('join_')) {
        const addr = startParam.slice('join_'.length);
        if (addr) router.replace(`/join/${addr}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;
    let off: (() => void) | undefined;
    (async () => {
      const wa = await getWebApp();
      if (!mounted || !wa) return;
      const back = wa.BackButton;
      const handler = () => router.back();
      try {
        back.onClick(handler);
        if (pathname && pathname !== '/') back.show();
        else back.hide();
      } catch {
        // ignore
      }
      off = () => {
        try {
          back.offClick(handler);
          back.hide();
        } catch {
          // ignore
        }
      };
    })();
    return () => {
      mounted = false;
      off?.();
    };
  }, [pathname, router]);

  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      <WalletSync />
      {children}
    </TonConnectUIProvider>
  );
}
