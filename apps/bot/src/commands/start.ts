import type { CommandContext, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { t, resolveLocale, type Locale } from '../i18n.js';
import { tmaDeepLink } from '../config.js';
import type { BotDeps } from '../deps.js';
import { recordReferrerIfNew } from '../services/supabaseClient.js';
import { calculate_payout } from '@roosta/shared/payout';

/** TON addresses are 48-char base64url (EQ…/UQ…/kQ…/0Q…) or 64-char hex. */
const KYE_ADDRESS_RE = /^[A-Za-z0-9_-]{48}$|^[A-Fa-f0-9]{64}$/;

function isValidKyeAddress(addr: string): boolean {
  return KYE_ADDRESS_RE.test(addr);
}

function intervalLabel(seconds: number, locale: Locale): string {
  const day = 86_400;
  const week = 7 * day;
  const month = 30 * day;
  if (seconds % month === 0 && seconds >= month) {
    const n = seconds / month;
    return locale === 'ko' ? `${n}개월` : `${n} month${n === 1 ? '' : 's'}`;
  }
  if (seconds % week === 0 && seconds >= week) {
    const n = seconds / week;
    return locale === 'ko' ? `${n}주` : `${n} week${n === 1 ? '' : 's'}`;
  }
  const n = Math.max(1, Math.round(seconds / day));
  return locale === 'ko' ? `${n}일` : `${n} day${n === 1 ? '' : 's'}`;
}

function formatUsdt(minor: bigint): string {
  // 6-decimal minor units → human "12.34".
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  const fracStr = frac === 0n ? '' : `.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`;
  return `${negative ? '-' : ''}${whole.toString()}${fracStr}`;
}

export function buildStartReply(
  locale: Locale,
  tmaUrl: string,
): { text: string; keyboard: InlineKeyboard } {
  const keyboard = new InlineKeyboard().webApp(t(locale, 'start.open_tma'), tmaUrl);
  return { text: t(locale, 'start.welcome'), keyboard };
}

export interface InvitePreview {
  text: string;
  keyboard: InlineKeyboard;
}

export function buildInvitePreview(
  locale: Locale,
  tmaUrl: string,
  data: {
    name: string;
    organizerHandle: string;
    filled: number;
    total: number;
    contributionMinor: bigint;
    intervalSec: number;
    feeRateBps: number;
    alphaMaxBps: number;
    contractAddress: string;
  },
): InvitePreview {
  const slot1 = calculate_payout({
    N: data.total,
    C: data.contributionMinor,
    F_bps: data.feeRateBps,
    alpha_max_bps: data.alphaMaxBps,
    k: 1,
  });
  const slotN = calculate_payout({
    N: data.total,
    C: data.contributionMinor,
    F_bps: data.feeRateBps,
    alpha_max_bps: data.alphaMaxBps,
    k: data.total,
  });
  const lines = [
    t(locale, 'invite.title'),
    t(locale, 'invite.line_name', { name: data.name }),
    t(locale, 'invite.line_organizer', { organizer: data.organizerHandle }),
    t(locale, 'invite.line_members', { filled: data.filled, total: data.total }),
    t(locale, 'invite.line_contribution', {
      amount: formatUsdt(data.contributionMinor),
      interval: intervalLabel(data.intervalSec, locale),
    }),
    t(locale, 'invite.line_payout_range', {
      minPayout: `${formatUsdt(slot1.payout)} USDT`,
      maxPayout: `${formatUsdt(slotN.payout)} USDT`,
      N: data.total,
    }),
  ];
  const keyboard = new InlineKeyboard()
    .webApp(t(locale, 'invite.open_button'), tmaDeepLink(tmaUrl, `/join/${data.contractAddress}`))
    .row()
    .text(t(locale, 'invite.decline_button'), 'invite:decline');
  return { text: lines.join('\n'), keyboard };
}

export function createStartCommand(deps: BotDeps) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    const locale = resolveLocale(ctx.from?.language_code);
    const payload = typeof ctx.match === 'string' ? ctx.match.trim() : '';

    // Plain /start — welcome card.
    if (!payload) {
      const { text, keyboard } = buildStartReply(locale, deps.tmaUrl);
      await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
      return;
    }

    // Invite-link deeplink: `/start kye_<address>`.
    if (payload.startsWith('kye_')) {
      const address = payload.slice(4);
      if (!isValidKyeAddress(address)) {
        await ctx.reply(t(locale, 'start.invalid_invite'));
        return;
      }
      const kyeResp = await deps.backend.getKye(address).catch(() => null);
      if (!kyeResp) {
        await ctx.reply(t(locale, 'invite.not_found'));
        return;
      }
      const filled = kyeResp.members.length;
      const params = kyeResp.kye.params;
      const preview = buildInvitePreview(locale, deps.tmaUrl, {
        name: kyeResp.kye.name,
        organizerHandle: ctx.from?.username ? `@${ctx.from.username}` : kyeResp.kye.organizerId,
        filled,
        total: params.N,
        contributionMinor: BigInt(params.contribution),
        intervalSec: params.roundIntervalSec,
        feeRateBps: params.feeRateBps,
        alphaMaxBps: params.alphaMaxBps,
        contractAddress: kyeResp.kye.contractAddress,
      });
      await ctx.reply(preview.text, {
        reply_markup: preview.keyboard,
        parse_mode: 'Markdown',
      });

      // Record the organizer as referrer if the joining user has none yet.
      const organizerTgId = kyeResp.kye.organizerTelegramId;
      if (deps.supabase && ctx.from?.id && organizerTgId) {
        await recordReferrerIfNew(deps.supabase, ctx.from.id, organizerTgId).catch(
          () => undefined,
        );
      }
      return;
    }

    // Unknown payload — fall back to welcome.
    const { text, keyboard } = buildStartReply(locale, deps.tmaUrl);
    await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
  };
}
