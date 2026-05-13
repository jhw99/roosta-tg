/**
 * Bot configuration loader — wraps the shared env schema plus a few
 * bot-specific values not in the base schema.
 */
import { loadEnv, type Env } from '@roosta/shared/env';

export interface BotConfig extends Env {
  TMA_URL: string;
  BACKEND_URL: string;
  BOT_SERVICE_TOKEN: string | undefined;
  BOT_USERNAME: string;
  WEBHOOK_PORT: number;
  WEBHOOK_PATH: string;
}

export function loadBotConfig(source: NodeJS.ProcessEnv = process.env): BotConfig {
  const env = loadEnv(source);
  const tmaUrl = env.TMA_URL ?? source.TMA_URL ?? 'https://t.me/roosta_bot/app';
  const backendUrl = source.BACKEND_URL ?? `http://localhost:${env.BACKEND_PORT ?? env.PORT}`;
  const botUsername = source.NEXT_PUBLIC_BOT_USERNAME ?? source.BOT_USERNAME ?? 'roosta_bot';
  const webhookPort = source.WEBHOOK_PORT ? Number(source.WEBHOOK_PORT) : env.PORT;
  const webhookPath = source.TELEGRAM_WEBHOOK_PATH ?? '/webhook';
  return {
    ...env,
    TMA_URL: tmaUrl,
    BACKEND_URL: backendUrl,
    BOT_SERVICE_TOKEN: source.BOT_SERVICE_TOKEN,
    BOT_USERNAME: botUsername,
    WEBHOOK_PORT: webhookPort,
    WEBHOOK_PATH: webhookPath,
  };
}

/** Build a TMA deeplink for a given internal path (e.g. `/kye/<addr>`). */
export function tmaDeepLink(tmaUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  // For t.me TMA URLs we append `?startapp=` so initData carries the path.
  // For direct https URLs we append the path as a hash fragment.
  if (tmaUrl.startsWith('https://t.me/')) {
    // startapp must be URL-safe; encode slashes as `__`.
    const encoded = normalizedPath.replace(/\//g, '__').replace(/^__/, '');
    const sep = tmaUrl.includes('?') ? '&' : '?';
    return `${tmaUrl}${sep}startapp=${encoded}`;
  }
  return `${tmaUrl.replace(/\/$/, '')}${normalizedPath}`;
}
