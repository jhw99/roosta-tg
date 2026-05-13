/** English message bundle. Keys mirror those in ko.ts. */
export const en: Record<string, string> = {
  // /start
  'start.welcome':
    "Welcome to Roosta — Telegram-native rotating savings on TON.\n\nTap the button below to open the mini-app.",
  'start.open_tma': 'Open Roosta',
  'start.invalid_invite': 'That invite link looks invalid. Please ask the organizer for a new one.',

  // /help
  'help.title': '*Roosta — Help*',
  'help.body':
    '*Commands*\n' +
    '/start — Open Roosta\n' +
    '/mycircles — List the circles you participate in\n' +
    '/settings — Notification & profile settings\n' +
    '/lang — Switch language (한국어 / English)\n' +
    '/help — Show this message\n\n' +
    '*Group commands* (organizer only)\n' +
    '/linkcircle <address> — Link this group to a circle\n' +
    '/unlinkcircle — Remove the link',

  // /mycircles (legacy key kept as 'mykyes.*' for backward compat with code)
  'mykyes.title': '*Your circles*',
  'mykyes.empty': "You're not in any circles yet. Create one to get started.",
  'mykyes.create_button': 'Create a circle',
  'mykyes.error': 'Could not load your circles right now. Please try again later.',

  // /settings
  'settings.body': 'Manage your notification & profile settings inside Roosta.',
  'settings.button': 'Open settings in Roosta',

  // /lang
  'lang.prompt': 'Choose your language:',
  'lang.button_ko': '한국어',
  'lang.button_en': 'English',
  'lang.changed': 'Language updated to English.',
  'lang.error': 'Could not save your language. Please try again.',

  // /start kye_<addr> preview
  'invite.title': "*You're invited to a circle*",
  'invite.line_name': 'Name: *{name}*',
  'invite.line_organizer': 'Organizer: {organizer}',
  'invite.line_members': 'Members: {filled} / {total}',
  'invite.line_contribution': 'Contribution: *{amount} USDT* every {interval}',
  'invite.line_payout_range': 'Estimated payout: *{minPayout}* (slot 1) — *{maxPayout}* (slot {N})',
  'invite.open_button': 'Open Roosta to join',
  'invite.decline_button': 'Not now',
  'invite.declined': 'Maybe next time.',
  'invite.not_found': "That circle could not be found. The invite may have expired.",

  // group / link
  'group.welcome':
    "Hi! I'm the Roosta bot.\n\n" +
    'Organizer: link this group to your circle by sending\n' +
    '`/linkcircle <circle_address>`',
  'group.link_ok': 'This group is now linked to *{name}*.',
  'group.link_invalid': 'Usage: /linkcircle <circle_address>',
  'group.link_not_found': 'No circle found with that address.',
  'group.link_forbidden': 'Only the circle organizer can link a group.',
  'group.unlink_ok': 'Group unlinked. Notifications will fall back to DM.',
  'group.unlink_none': 'This group is not linked to any circle.',
  'group.dm_only': 'This command only works inside a group chat.',
  'group.private_only': 'This command only works in a private chat.',
};
