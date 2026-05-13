import { logger } from '../lib/logger.js';

export interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface SendMessageOptions {
  chatId: number | string;
  text: string;
  buttons?: InlineButton[][];
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
}

export interface SendResult {
  ok: boolean;
  status: number;
  /** Telegram retry_after (seconds) when rate-limited. */
  retryAfter?: number;
  description?: string;
  messageId?: number;
}

export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
}>;

let _fetch: FetchLike | null = null;
export function __setFetch(f: FetchLike | null): void {
  _fetch = f;
}

function getFetch(): FetchLike {
  if (_fetch) return _fetch;
  // Native fetch is available in Node 18+.
  return globalThis.fetch as unknown as FetchLike;
}

interface TgResponse {
  ok: boolean;
  description?: string;
  parameters?: { retry_after?: number };
  result?: { message_id?: number };
}

/** POST sendMessage to the Telegram Bot API. */
export async function sendMessage(
  token: string,
  opts: SendMessageOptions,
): Promise<SendResult> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: opts.chatId,
    text: opts.text,
    parse_mode: opts.parseMode ?? 'Markdown',
    disable_web_page_preview: true,
  };
  if (opts.buttons && opts.buttons.length > 0) {
    body.reply_markup = { inline_keyboard: opts.buttons };
  }

  const res = await getFetch()(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as TgResponse;
  if (res.ok && json.ok) {
    return { ok: true, status: res.status, messageId: json.result?.message_id };
  }
  const retryAfter = json.parameters?.retry_after;
  if (res.status === 429 && retryAfter) {
    logger.warn({ retryAfter }, 'telegram rate limit');
    return { ok: false, status: 429, retryAfter, description: json.description };
  }
  return { ok: false, status: res.status, description: json.description };
}
