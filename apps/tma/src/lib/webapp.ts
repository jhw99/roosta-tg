'use client';

import type WebAppType from '@twa-dev/sdk';

let cached: typeof WebAppType | null = null;

export async function getWebApp(): Promise<typeof WebAppType | null> {
  if (typeof window === 'undefined') return null;
  if (cached) return cached;
  try {
    const mod = await import('@twa-dev/sdk');
    cached = mod.default;
    return cached;
  } catch {
    return null;
  }
}

export function getInitData(): string {
  if (typeof window === 'undefined') return '';
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return tg?.WebApp?.initData ?? '';
}

export function getTelegramLanguage(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const tg = (window as unknown as {
    Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } };
  }).Telegram;
  return tg?.WebApp?.initDataUnsafe?.user?.language_code;
}
