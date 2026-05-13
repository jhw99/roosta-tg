import type { Context } from 'grammy';
import { t, resolveLocale } from '../i18n.js';
import type { BotDeps } from '../deps.js';

/**
 * Fires when a user joins a chat. If the bot itself is among the new members,
 * we treat it as "bot added to group" and post the linkkye onboarding card.
 */
export function createNewChatMembersHandler(deps: BotDeps) {
  return async (ctx: Context): Promise<void> => {
    const members = ctx.message?.new_chat_members ?? [];
    if (members.length === 0) return;
    const me = await ctx.api.getMe();
    const botAdded = members.some((m) => m.id === me.id);
    if (!botAdded) return;

    const locale = resolveLocale(ctx.from?.language_code);
    await ctx.reply(t(locale, 'group.welcome'), { parse_mode: 'Markdown' });
    deps.logger.info({ chatId: ctx.chat?.id }, 'bot added to group');
  };
}
