'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
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

  return <TonConnectUIProvider manifestUrl={MANIFEST_URL}>{children}</TonConnectUIProvider>;
}
