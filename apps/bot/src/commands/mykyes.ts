import type { CommandContext, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { t, resolveLocale, type Locale } from '../i18n.js';
import { tmaDeepLink } from '../config.js';
import type { BotDeps } from '../deps.js';
import type { BackendUserKyeSummary } from '../services/backendClient.js';

export function buildMyKyesReply(
  locale: Locale,
  tmaUrl: string,
  kyes: BackendUserKyeSummary[],
): { text: string; keyboard: InlineKeyboard } {
  if (kyes.length === 0) {
    const keyboard = new InlineKeyboard().webApp(
      t(locale, 'mykyes.create_button'),
      tmaDeepLink(tmaUrl, '/create'),
    );
    return { text: t(locale, 'mykyes.empty'), keyboard };
  }
  const keyboard = new InlineKeyboard();
  for (const k of kyes) {
    keyboard.webApp(k.name, tmaDeepLink(tmaUrl, `/kye/${k.contractAddress}`)).row();
  }
  return { text: t(locale, 'mykyes.title'), keyboard };
}

export function createMyKyesCommand(deps: BotDeps) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    const locale = resolveLocale(ctx.from?.language_code);
    if (!ctx.from) return;
    try {
      const me = await deps.backend.getMe(ctx.from.id);
      const kyes = me?.kyes ?? [];
      const { text, keyboard } = buildMyKyesReply(locale, deps.tmaUrl, kyes);
      await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    } catch (err) {
      deps.logger.error({ err }, '/mykyes failed');
      await ctx.reply(t(locale, 'mykyes.error'));
    }
  };
}
