import type { CommandContext, Context } from 'grammy';
import { t, resolveLocale } from '../i18n.js';
import type { BotDeps } from '../deps.js';
import { findUserByTelegramId } from '../services/supabaseClient.js';

export function createUnlinkKyeCommand(deps: BotDeps) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    const locale = resolveLocale(ctx.from?.language_code);
    const chatType = ctx.chat?.type;
    if (chatType !== 'group' && chatType !== 'supergroup') {
      await ctx.reply(t(locale, 'group.dm_only'));
      return;
    }
    if (!deps.supabase || !ctx.from) {
      await ctx.reply(t(locale, 'group.unlink_none'));
      return;
    }

    const { data: row } = await deps.supabase
      .from('kye_groups')
      .select('kye_id, kyes!inner(organizer_id)')
      .eq('chat_id', ctx.chat.id)
      .maybeSingle();
    if (!row) {
      await ctx.reply(t(locale, 'group.unlink_none'));
      return;
    }

    const link = row as { kye_id: string; kyes: { organizer_id: string } | { organizer_id: string }[] };
    const organizerId = Array.isArray(link.kyes) ? link.kyes[0]?.organizer_id : link.kyes.organizer_id;
    const caller = await findUserByTelegramId(deps.supabase, ctx.from.id);
    if (!caller || caller.id !== organizerId) {
      await ctx.reply(t(locale, 'group.link_forbidden'));
      return;
    }

    const { error } = await deps.supabase
      .from('kye_groups')
      .delete()
      .eq('kye_id', link.kye_id);
    if (error) {
      deps.logger.error({ err: error }, 'unlinkkye: delete failed');
      return;
    }
    await ctx.reply(t(locale, 'group.unlink_ok'));
  };
}
