import { en, type Strings } from './en';
import { ko } from './ko';

export type Lang = 'en' | 'ko';

const dict: Record<Lang, Strings> = { en, ko };

export function getStrings(lang: Lang): Strings {
  return dict[lang] ?? en;
}

export function detectLang(languageCode: string | undefined, override?: Lang | null): Lang {
  if (override === 'en' || override === 'ko') return override;
  if (languageCode?.toLowerCase().startsWith('ko')) return 'ko';
  return 'en';
}

export type { Strings };
