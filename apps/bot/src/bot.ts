/**
 * grammY bot factory. Returns a configured `Bot` with all commands, callback
 * handlers, and chat-member observers wired up. Stateless — caller decides
 * whether to run polling or mount the webhook handler.
 */
import { Bot, type Context } from 'grammy';
import { createStartCommand } from './commands/start.js';
import { createMyKyesCommand } from './commands/mykyes.js';
import { createHelpCommand } from './commands/help.js';
import { createSettingsCommand } from './commands/settings.js';
import { createLangCommand, createLangCallback } from './commands/lang.js';
import { createLinkKyeCommand } from './commands/linkkye.js';
import { createUnlinkKyeCommand } from './commands/unlinkkye.js';
import { createNewChatMembersHandler } from './handlers/newChatMembers.js';
import { createMyChatMemberHandler } from './handlers/myChatMember.js';
import { t, resolveLocale } from './i18n.js';
import type { BotDeps } from './deps.js';

export function createBot(token: string, deps: BotDeps): Bot<Context> {
  const bot = new Bot<Context>(token);

  // Commands
  bot.command('start', createStartCommand(deps));
  bot.command('mykyes', createMyKyesCommand(deps));
  bot.command('help', createHelpCommand());
  bot.command('settings', createSettingsCommand(deps));
  bot.command('lang', createLangCommand());
  bot.command('linkkye', createLinkKyeCommand(deps));
  bot.command('unlinkkye', createUnlinkKyeCommand(deps));

  // Callback queries
  bot.callbackQuery(/^lang:(ko|en)$/, createLangCallback(deps));
  bot.callbackQuery('invite:decline', async (ctx) => {
    const locale = resolveLocale(ctx.from?.language_code);
    await ctx.answerCallbackQuery();
    if (ctx.callbackQuery.message) {
      await ctx.editMessageText(t(locale, 'invite.declined')).catch(() => undefined);
    }
  });

  // Chat-member observers
  bot.on('message:new_chat_members', createNewChatMembersHandler(deps));
  bot.on('my_chat_member', createMyChatMemberHandler(deps));

  bot.catch((err) => deps.logger.error({ err }, 'bot error'));

  return bot;
}
