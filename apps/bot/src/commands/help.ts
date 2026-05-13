import type { CommandContext, Context } from 'grammy';
import { t, resolveLocale } from '../i18n.js';

export function createHelpCommand() {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    const locale = resolveLocale(ctx.from?.language_code);
    const body = `${t(locale, 'help.title')}\n\n${t(locale, 'help.body')}`;
    await ctx.reply(body, { parse_mode: 'Markdown' });
  };
}
