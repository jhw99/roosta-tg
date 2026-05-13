import type { CommandContext, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { t, resolveLocale, type Locale } from '../i18n.js';
import { tmaDeepLink } from '../config.js';
import type { BotDeps } from '../deps.js';

export function buildSettingsReply(
  locale: Locale,
  tmaUrl: string,
): { text: string; keyboard: InlineKeyboard } {
  const keyboard = new InlineKeyboard().webApp(
    t(locale, 'settings.button'),
    tmaDeepLink(tmaUrl, '/settings'),
  );
  return { text: t(locale, 'settings.body'), keyboard };
}

export function createSettingsCommand(deps: BotDeps) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    const locale = resolveLocale(ctx.from?.language_code);
    const { text, keyboard } = buildSettingsReply(locale, deps.tmaUrl);
    await ctx.reply(text, { reply_markup: keyboard });
  };
}
