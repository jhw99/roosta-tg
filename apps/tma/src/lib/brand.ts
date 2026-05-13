/**
 * Roosta Brand Constants — TypeScript (TMA)
 *
 * Mirrors the Solana app's app/lib/brand.ts. The brand is the same;
 * only the platform tagline / URL is adjusted for the Telegram Mini App.
 */

export const ROOSTA_BRAND = {
  name: 'Roosta',
  tagline: 'Telegram-native social savings',
  description:
    'Roosta turns ROSCAs (Korean kye, Mexican tanda, West African sou-sou) into a Telegram-native social savings protocol — pool USDT on TON, automate rotating payouts, and build portable financial reputation.',
  url: 'https://roosta-tg.vercel.app',
} as const;

export const ROOSTA_COLORS = {
  // Brand
  orangeDeep: '#C73E1D',
  orangeMain: '#E85D2F',
  orangeWarm: '#F4A261',

  // Background
  bgLight: '#FAFAF7',
  bgDark: '#1A1A1A',
  surfaceLight: '#FFFFFF',
  surfaceDark: '#242422',

  // Text
  textDark: '#1A1A1A',
  textLight: '#FAFAF7',
  textMuted: '#6A6A6A',
  textMutedDark: '#A0A0A0',

  // State
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
} as const;

export const ROOSTA_PALETTE_SCALE = {
  50: '#FFF7F2',
  100: '#FFEAD9',
  200: '#FCD0AB',
  300: '#F4A261',
  400: '#ED7E47',
  500: '#E85D2F',
  600: '#D74E22',
  700: '#C73E1D',
  800: '#A03217',
  900: '#6E2310',
} as const;

export const ROOSTA_FONTS = {
  display: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  body: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

export type RoostaColorKey = keyof typeof ROOSTA_COLORS;
export type RoostaPaletteShade = keyof typeof ROOSTA_PALETTE_SCALE;
