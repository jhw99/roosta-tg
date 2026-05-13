import type { CommandContext, Context } from 'grammy';
import { t, resolveLocale } from '../i18n.js';
import type { BotDeps } from '../deps.js';
import { findUserByTelegramId } from '../services/supabaseClient.js';

/**
 * `/linkkye <kye_address>` — only the kye's organizer may run it.
 * Authorization rule:
 *   1. Chat must be a group / supergroup.
 *   2. Caller telegram_id must resolve to a users row whose id == kyes.organizer_id.
 */
export function createLinkKyeCommand(deps: BotDeps) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    const locale = resolveLocale(ctx.from?.language_code);
    const chatType = ctx.chat?.type;
    if (chatType !== 'group' && chatType !== 'supergroup') {
      await ctx.reply(t(locale, 'group.dm_only'));
      return;
    }
    const arg = (typeof ctx.match === 'string' ? ctx.match : '').trim();
    if (!arg) {
      await ctx.reply(t(locale, 'group.link_invalid'));
      return;
    }
    if (!deps.supabase || !ctx.from) {
      deps.logger.warn('linkkye: missing supabase or from');
      await ctx.reply(t(locale, 'group.link_not_found'));
      return;
    }

    const { data: kye } = await deps.supabase
      .from('kyes')
      .select('id, name, contract_address, organizer_id')
      .eq('contract_address', arg)
      .maybeSingle();
    if (!kye) {
      await ctx.reply(t(locale, 'group.link_not_found'));
      return;
    }

    const caller = await findUserByTelegramId(deps.supabase, ctx.from.id);
    if (!caller || caller.id !== (kye as { organizer_id: string }).organizer_id) {
      await ctx.reply(t(locale, 'group.link_forbidden'));
      return;
    }

    const { error } = await deps.supabase.from('kye_groups').upsert(
      { kye_id: (kye as { id: string }).id, chat_id: ctx.chat.id },
      { onConflict: 'kye_id' },
    );
    if (error) {
      deps.logger.error({ err: error }, 'linkkye: upsert failed');
      await ctx.reply(t(locale, 'group.link_not_found'));
      return;
    }
    await ctx.reply(t(locale, 'group.link_ok', { name: (kye as { name: string }).name }), {
      parse_mode: 'Markdown',
    });
  };
}
