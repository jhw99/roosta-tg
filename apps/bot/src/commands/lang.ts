import type { CommandContext, Context, CallbackQueryContext } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { t, resolveLocale, type Locale } from '../i18n.js';
import type { BotDeps } from '../deps.js';
import { upsertUserLanguage } from '../services/supabaseClient.js';

export function buildLangPrompt(locale: Locale): { text: string; keyboard: InlineKeyboard } {
  const keyboard = new InlineKeyboard()
    .text(t(locale, 'lang.button_ko'), 'lang:ko')
    .text(t(locale, 'lang.button_en'), 'lang:en');
  return { text: t(locale, 'lang.prompt'), keyboard };
}

export function createLangCommand() {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    const locale = resolveLocale(ctx.from?.language_code);
    const { text, keyboard } = buildLangPrompt(locale);
    await ctx.reply(text, { reply_markup: keyboard });
  };
}

/** Callback handler for `lang:ko` / `lang:en`. */
export function createLangCallback(deps: BotDeps) {
  return async (ctx: CallbackQueryContext<Context>): Promise<void> => {
    const data = ctx.callbackQuery.data ?? '';
    const choice: Locale = data === 'lang:ko' ? 'ko' : 'en';
    const tgId = ctx.from?.id;
    if (!tgId) {
      await ctx.answerCallbackQuery();
      return;
    }

    let ok = true;
    if (deps.supabase) {
      ok = await upsertUserLanguage(deps.supabase, tgId, choice);
    }
    await ctx.answerCallbackQuery();
    if (!ok) {
      await ctx.reply(t(choice, 'lang.error'));
      return;
    }
    await ctx.reply(t(choice, 'lang.changed'));
  };
}
