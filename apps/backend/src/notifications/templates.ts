import type { InlineButton } from './botApi.js';

export type Locale = 'ko' | 'en';

export interface RenderedTemplate {
  text: string;
  buttons: InlineButton[][];
}

export type TemplateFn = (payload: Record<string, unknown>, tmaUrl?: string) => RenderedTemplate;

const num = (v: unknown): string => {
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  return '';
};

const tmaButton = (label: string, tmaUrl: string | undefined, path = ''): InlineButton => ({
  text: label,
  url: tmaUrl ? `${tmaUrl}${path}` : 'https://t.me',
});

/**
 * Templates per GSD §6.1.
 * Keyed by `${eventType}.${locale}`.
 */
export const templates: Record<string, TemplateFn> = {
  // ---------------- kye_created (organizer DM) ----------------
  'kye_created.en': (p, tma) => ({
    text:
      `*Your Kye is ready* \u{1F389}\n` +
      `Name: *${num(p.name) || 'Kye'}*\n` +
      `Members: *${num(p.memberCount)}*\n` +
      `Share the invite link with your members.`,
    buttons: [[tmaButton('Open Kye', tma, `?startapp=kye_${num(p.kyeId)}`)]],
  }),
  'kye_created.ko': (p, tma) => ({
    text:
      `*계가 생성되었습니다* \u{1F389}\n` +
      `이름: *${num(p.name) || '계'}*\n` +
      `정원: *${num(p.memberCount)}명*\n` +
      `초대 링크를 멤버에게 공유하세요.`,
    buttons: [[tmaButton('계 열기', tma, `?startapp=kye_${num(p.kyeId)}`)]],
  }),

  // ---------------- member_joined (group/DM) ----------------
  'member_joined.en': (p, tma) => ({
    text: `*${num(p.memberName) || 'A member'}* joined as order *#${num(p.orderNum)}* (${num(p.filled)}/${num(p.memberCount)})`,
    buttons: [[tmaButton('View', tma, `?startapp=kye_${num(p.kyeId)}`)]],
  }),
  'member_joined.ko': (p, tma) => ({
    text: `*${num(p.memberName) || '새 멤버'}*님이 *${num(p.orderNum)}번* 순서로 가입했습니다 (${num(p.filled)}/${num(p.memberCount)})`,
    buttons: [[tmaButton('보기', tma, `?startapp=kye_${num(p.kyeId)}`)]],
  }),

  // ---------------- kye_activated ----------------
  'kye_activated.en': (p, tma) => ({
    text:
      `\u{1F680} *Kye is now active!*\n` +
      `First round: *${num(p.firstRoundAt)}*`,
    buttons: [[tmaButton('Open Kye', tma, `?startapp=kye_${num(p.kyeId)}`)]],
  }),
  'kye_activated.ko': (p, tma) => ({
    text:
      `\u{1F680} *계가 시작되었습니다!*\n` +
      `첫 라운드: *${num(p.firstRoundAt)}*`,
    buttons: [[tmaButton('계 열기', tma, `?startapp=kye_${num(p.kyeId)}`)]],
  }),

  // ---------------- round_reminder_24h ----------------
  'round_reminder_24h.en': (p, tma) => ({
    text:
      `\u{23F0} *Round in 24h*\n` +
      `Time: *${num(p.scheduledAt)}*\n` +
      `Auto-withdrawal: *${num(p.contribution)} USDT*\n` +
      `Make sure your wallet is funded.`,
    buttons: [[tmaButton('Top up', tma, `?startapp=wallet`)]],
  }),
  'round_reminder_24h.ko': (p, tma) => ({
    text:
      `\u{23F0} *라운드 24시간 전*\n` +
      `시간: *${num(p.scheduledAt)}*\n` +
      `자동 인출: *${num(p.contribution)} USDT*\n` +
      `지갑 잔액을 확인해 주세요.`,
    buttons: [[tmaButton('충전하기', tma, `?startapp=wallet`)]],
  }),

  // ---------------- round_reminder_1h ----------------
  'round_reminder_1h.en': (p, tma) => ({
    text:
      `\u{23F3} *Round in 1h*\n` +
      `Auto-withdrawal: *${num(p.contribution)} USDT*`,
    buttons: [[tmaButton('Top up', tma, `?startapp=wallet`)]],
  }),
  'round_reminder_1h.ko': (p, tma) => ({
    text:
      `\u{23F3} *라운드 1시간 전*\n` +
      `자동 인출: *${num(p.contribution)} USDT*`,
    buttons: [[tmaButton('충전하기', tma, `?startapp=wallet`)]],
  }),

  // ---------------- round_executed (group) ----------------
  'round_executed.en': (p, tma) => ({
    text:
      `\u{1F3C6} *Round #${num(p.roundNum)} executed*\n` +
      `Winner: *${num(p.winnerName) || num(p.winner)}*\n` +
      `Payout: *${num(p.payout)} USDT*\n` +
      `Next round: *${num(p.nextRoundAt)}*`,
    buttons: [[tmaButton('History', tma, `?startapp=kye_${num(p.kyeId)}_rounds`)]],
  }),
  'round_executed.ko': (p, tma) => ({
    text:
      `\u{1F3C6} *${num(p.roundNum)}라운드 실행 완료*\n` +
      `당첨자: *${num(p.winnerName) || num(p.winner)}*\n` +
      `지급액: *${num(p.payout)} USDT*\n` +
      `다음 라운드: *${num(p.nextRoundAt)}*`,
    buttons: [[tmaButton('히스토리', tma, `?startapp=kye_${num(p.kyeId)}_rounds`)]],
  }),

  // ---------------- payout_received (winner DM) ----------------
  'payout_received.en': (p, tma) => ({
    text:
      `\u{1F389} *You received your payout!*\n` +
      `Amount: *${num(p.amount)} USDT*\n` +
      `Tx: \`${num(p.txHash)}\``,
    buttons: [
      [tmaButton('Open Kye', tma, `?startapp=kye_${num(p.kyeId)}`)],
      [{ text: 'View tx', url: `https://tonscan.org/tx/${num(p.txHash)}` }],
    ],
  }),
  'payout_received.ko': (p, tma) => ({
    text:
      `\u{1F389} *페이아웃을 받았습니다!*\n` +
      `금액: *${num(p.amount)} USDT*\n` +
      `Tx: \`${num(p.txHash)}\``,
    buttons: [
      [tmaButton('계 열기', tma, `?startapp=kye_${num(p.kyeId)}`)],
      [{ text: '트랜잭션 보기', url: `https://tonscan.org/tx/${num(p.txHash)}` }],
    ],
  }),

  // ---------------- default_detected_member ----------------
  'default_detected_member.en': (p, tma) => ({
    text:
      `\u{26A0} *Payment failed*\n` +
      `Round #${num(p.roundNum)} could not withdraw from your wallet.\n` +
      `You have *24h* grace period. Top up to avoid policy action.`,
    buttons: [[tmaButton('Top up now', tma, `?startapp=wallet`)]],
  }),
  'default_detected_member.ko': (p, tma) => ({
    text:
      `\u{26A0} *납입 실패*\n` +
      `${num(p.roundNum)}라운드 자동 인출이 실패했습니다.\n` +
      `*24시간* 유예 후 정책이 적용됩니다.`,
    buttons: [[tmaButton('지금 충전', tma, `?startapp=wallet`)]],
  }),

  // ---------------- default_detected_organizer ----------------
  'default_detected_organizer.en': (p, tma) => ({
    text:
      `\u{26A0} *Member defaulted*\n` +
      `Member: *${num(p.memberName) || num(p.member)}*\n` +
      `Round #${num(p.roundNum)}\n` +
      `Policy: *${num(p.policy)}*\n` +
      `Action at: *${num(p.actionAt)}*`,
    buttons: [[tmaButton('Manage', tma, `?startapp=kye_${num(p.kyeId)}`)]],
  }),
  'default_detected_organizer.ko': (p, tma) => ({
    text:
      `\u{26A0} *미납 발생*\n` +
      `대상: *${num(p.memberName) || num(p.member)}*\n` +
      `${num(p.roundNum)}라운드\n` +
      `정책: *${num(p.policy)}*\n` +
      `조치 시각: *${num(p.actionAt)}*`,
    buttons: [[tmaButton('관리', tma, `?startapp=kye_${num(p.kyeId)}`)]],
  }),

  // ---------------- default_policy_applied (group) ----------------
  'default_policy_applied.en': (p, tma) => ({
    text:
      `\u{2696} *Default policy applied*\n` +
      `Policy: *${num(p.policy)}*\n` +
      `Impacted amount: *${num(p.amount)} USDT*`,
    buttons: [[tmaButton('Details', tma, `?startapp=kye_${num(p.kyeId)}`)]],
  }),
  'default_policy_applied.ko': (p, tma) => ({
    text:
      `\u{2696} *디폴트 정책이 적용되었습니다*\n` +
      `정책: *${num(p.policy)}*\n` +
      `영향 금액: *${num(p.amount)} USDT*`,
    buttons: [[tmaButton('상세보기', tma, `?startapp=kye_${num(p.kyeId)}`)]],
  }),

  // ---------------- kye_completed ----------------
  'kye_completed.en': (p, tma) => ({
    text:
      `\u{1F3C1} *Kye completed!*\n` +
      `Total rounds: *${num(p.totalRounds)}*\n` +
      `Total volume: *${num(p.totalVolume)} USDT*\n` +
      `Thanks for participating!`,
    buttons: [
      [tmaButton('Summary', tma, `?startapp=kye_${num(p.kyeId)}`)],
      [tmaButton('Start new Kye', tma, `?startapp=create`)],
    ],
  }),
  'kye_completed.ko': (p, tma) => ({
    text:
      `\u{1F3C1} *계가 완주되었습니다!*\n` +
      `총 라운드: *${num(p.totalRounds)}*\n` +
      `총 거래량: *${num(p.totalVolume)} USDT*\n` +
      `참여해 주셔서 감사합니다!`,
    buttons: [
      [tmaButton('결과 보기', tma, `?startapp=kye_${num(p.kyeId)}`)],
      [tmaButton('새 계 만들기', tma, `?startapp=create`)],
    ],
  }),
};

/** Map an event type + locale to a template. Falls back to English. */
export function renderTemplate(
  eventType: string,
  locale: Locale,
  payload: Record<string, unknown>,
  tmaUrl?: string,
): RenderedTemplate | null {
  const fn = templates[`${eventType}.${locale}`] ?? templates[`${eventType}.en`];
  if (!fn) return null;
  return fn(payload, tmaUrl);
}

/**
 * Returns the notification-setting key that controls this event, or null if
 * the event has no user-toggleable setting (always sent).
 */
export function settingKeyFor(eventType: string): string | null {
  switch (eventType) {
    case 'round_reminder_24h':
      return 'round_reminder_24h';
    case 'round_reminder_1h':
      return 'round_reminder_1h';
    case 'round_executed':
      return 'round_executed';
    case 'default_detected_organizer':
      return 'default_other_member';
    case 'payout_received':
      return 'group_win_other';
    default:
      return null;
  }
}

/** Default value when no row exists. Per GSD §6.3. */
export function settingDefault(key: string): boolean {
  if (key === 'round_reminder_1h') return false;
  return true;
}
