'use client';

import { getStrings } from '../i18n';
import { useAppStore } from '../store';

export function useStrings() {
  const lang = useAppStore((s) => s.lang);
  return getStrings(lang);
}
