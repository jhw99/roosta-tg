/** Korean message bundle. */
export const ko: Record<string, string> = {
  'start.welcome':
    'Roosta에 오신 걸 환영합니다 — 텔레그램에서 운영하는 TON 기반 계입니다.\n\n아래 버튼을 눌러 미니앱을 열어 주세요.',
  'start.open_tma': 'Roosta 열기',
  'start.invalid_invite': '초대 링크가 유효하지 않습니다. 계주에게 새 링크를 요청해 주세요.',

  'help.title': '*Roosta — 도움말*',
  'help.body':
    '*명령어*\n' +
    '/start — Roosta 열기\n' +
    '/mykyes — 참여 중인 계 목록\n' +
    '/settings — 알림·프로필 설정\n' +
    '/lang — 언어 변경 (한국어 / English)\n' +
    '/help — 이 도움말 보기\n\n' +
    '*그룹 명령어* (계주 전용)\n' +
    '/linkkye <주소> — 이 그룹을 계와 연결\n' +
    '/unlinkkye — 연결 해제',

  'mykyes.title': '*내 계 목록*',
  'mykyes.empty': '아직 참여 중인 계가 없습니다. 새 계를 만들어 보세요.',
  'mykyes.create_button': '계 만들기',
  'mykyes.error': '지금은 계 목록을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.',

  'settings.body': '알림 및 프로필 설정은 Roosta 미니앱에서 관리합니다.',
  'settings.button': 'Roosta에서 설정 열기',

  'lang.prompt': '언어를 선택하세요:',
  'lang.button_ko': '한국어',
  'lang.button_en': 'English',
  'lang.changed': '언어가 한국어로 변경되었습니다.',
  'lang.error': '언어 설정을 저장하지 못했습니다. 다시 시도해 주세요.',

  'invite.title': '*계 초대장이 도착했어요*',
  'invite.line_name': '이름: *{name}*',
  'invite.line_organizer': '계주: {organizer}',
  'invite.line_members': '인원: {filled} / {total}',
  'invite.line_contribution': '회차당 납입: *{amount} USDT* / {interval}',
  'invite.line_payout_range': '예상 지급액: *{minPayout}* (1순위) — *{maxPayout}* ({N}순위)',
  'invite.open_button': 'Roosta에서 가입하기',
  'invite.decline_button': '다음에',
  'invite.declined': '다음에 다시 만나요.',
  'invite.not_found': '해당 계를 찾을 수 없습니다. 초대가 만료되었을 수 있어요.',

  'group.welcome':
    '안녕하세요! Roosta 봇입니다.\n\n' +
    '계주께서는 아래 명령으로 이 그룹과 계를 연결해 주세요.\n' +
    '`/linkkye <kye_address>`',
  'group.link_ok': '이 그룹이 *{name}* 와(과) 연결되었습니다.',
  'group.link_invalid': '사용법: /linkkye <kye_address>',
  'group.link_not_found': '해당 주소의 계를 찾을 수 없습니다.',
  'group.link_forbidden': '계주만 그룹을 연결할 수 있습니다.',
  'group.unlink_ok': '그룹 연결을 해제했습니다. 이후 알림은 DM으로 전송됩니다.',
  'group.unlink_none': '이 그룹은 어떤 계와도 연결되어 있지 않습니다.',
  'group.dm_only': '이 명령은 그룹 채팅에서만 사용할 수 있습니다.',
  'group.private_only': '이 명령은 개인 채팅에서만 사용할 수 있습니다.',
};
