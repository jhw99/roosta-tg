import type { Context } from 'grammy';
import type { BotDeps } from '../deps.js';

/**
 * Bot's own membership changed in some chat. When the bot is kicked / left,
 * we null out kye_groups.chat_id rows for this chat so the notification
 * worker falls back to DM-only delivery.
 *
 * Note: `kye_groups.chat_id` is NOT NULL in the migration, so "null out" is
 * implemented here as a row delete (equivalent semantically — chatId mapping
 * is removed and the worker code already handles the "no row" case as DM).
 */
export function createMyChatMemberHandler(deps: BotDeps) {
  return async (ctx: Context): Promise<void> => {
    const update = ctx.myChatMember;
    if (!update) return;
    const newStatus = update.new_chat_member.status;
    if (newStatus !== 'kicked' && newStatus !== 'left') return;

    const chatId = update.chat.id;
    if (!deps.supabase) {
      deps.logger.warn({ chatId }, 'bot removed but no supabase to unlink');
      return;
    }
    const { error } = await deps.supabase.from('kye_groups').delete().eq('chat_id', chatId);
    if (error) {
      deps.logger.error({ err: error, chatId }, 'failed to delete kye_groups row on kick');
      return;
    }
    deps.logger.info({ chatId }, 'bot removed; kye_groups mapping cleared');
  };
}
