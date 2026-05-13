import { en } from './i18n/en.js';
import { ko } from './i18n/ko.js';

export type Locale = 'en' | 'ko';

const bundles: Record<Locale, Record<string, string>> = { en, ko };

export function resolveLocale(input: string | undefined | null): Locale {
  if (!input) return 'en';
  return input.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function t(
  locale: Locale | string | undefined,
  key: string,
  vars: Record<string, string | number> = {},
): string {
  const loc: Locale = resolveLocale(locale ?? null);
  const bundle = bundles[loc];
  const template = bundle[key] ?? bundles.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? '' : String(v);
  });
}
