'use client';

import { create } from 'zustand';
import type { ApiKye, ApiUser } from './lib/api';
import type { Lang } from './i18n';

interface AppState {
  user: ApiUser | null;
  kyes: ApiKye[];
  selectedKyeAddress: string | null;
  lang: Lang;
  langOverride: Lang | null;
  hydrated: boolean;
  setUser: (u: ApiUser | null) => void;
  setKyes: (k: ApiKye[]) => void;
  selectKye: (addr: string | null) => void;
  setLang: (l: Lang, persist?: boolean) => void;
  setHydrated: (h: boolean) => void;
}

const STORAGE_KEY = 'roosta.langOverride';

function readOverride(): Lang | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'ko' || v === 'en') return v;
  return null;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  kyes: [],
  selectedKyeAddress: null,
  lang: 'en',
  langOverride: typeof window !== 'undefined' ? readOverride() : null,
  hydrated: false,
  setUser: (u) => set({ user: u }),
  setKyes: (k) => set({ kyes: k }),
  selectKye: (addr) => set({ selectedKyeAddress: addr }),
  setLang: (l, persist) => {
    if (persist && typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, l);
    }
    set({ lang: l, langOverride: persist ? l : null });
  },
  setHydrated: (h) => set({ hydrated: h }),
}));
