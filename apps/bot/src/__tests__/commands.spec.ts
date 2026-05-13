import { describe, it, expect } from 'vitest';
import { buildStartReply } from '../commands/start.js';
import { buildMyKyesReply } from '../commands/mykyes.js';
import { buildSettingsReply } from '../commands/settings.js';
import { buildLangPrompt } from '../commands/lang.js';
import { t } from '../i18n.js';

const TMA = 'https://t.me/roosta_bot/app';

describe('/start welcome card', () => {
  for (const locale of ['en', 'ko'] as const) {
    it(`renders welcome + web_app button (${locale})`, () => {
      const { text, keyboard } = buildStartReply(locale, TMA);
      expect(text).toBe(t(locale, 'start.welcome'));
      const inline = keyboard.inline_keyboard;
      expect(inline).toHaveLength(1);
      expect(inline[0]).toHaveLength(1);
      const btn = inline[0]![0]!;
      expect('web_app' in btn).toBe(true);
      if ('web_app' in btn) {
        expect(btn.web_app.url).toContain('roosta_bot');
        expect(btn.text).toBe(t(locale, 'start.open_tma'));
      }
    });
  }
});

describe('/mykyes reply', () => {
  for (const locale of ['en', 'ko'] as const) {
    it(`empty state shows create button (${locale})`, () => {
      const { text, keyboard } = buildMyKyesReply(locale, TMA, []);
      expect(text).toBe(t(locale, 'mykyes.empty'));
      const btn = keyboard.inline_keyboard[0]![0]!;
      expect('web_app' in btn).toBe(true);
      if ('web_app' in btn) expect(btn.text).toBe(t(locale, 'mykyes.create_button'));
    });

    it(`renders one button per kye (${locale})`, () => {
      const { text, keyboard } = buildMyKyesReply(locale, TMA, [
        { kyeId: '1', name: 'Alpha', contractAddress: 'EQAlpha', status: 'active', orderNum: 1, memberStatus: 'active' },
        { kyeId: '2', name: 'Beta', contractAddress: 'EQBeta', status: 'created', orderNum: 2, memberStatus: 'active' },
      ]);
      expect(text).toBe(t(locale, 'mykyes.title'));
      // Two kyes → at least two rows (trailing empty row from .row() is fine).
      const nonEmpty = keyboard.inline_keyboard.filter((r) => r.length > 0);
      expect(nonEmpty).toHaveLength(2);
      const first = nonEmpty[0]![0]!;
      if ('web_app' in first) expect(first.text).toBe('Alpha');
    });
  }
});

describe('/settings reply', () => {
  for (const locale of ['en', 'ko'] as const) {
    it(`renders TMA settings deeplink (${locale})`, () => {
      const { text, keyboard } = buildSettingsReply(locale, TMA);
      expect(text).toBe(t(locale, 'settings.body'));
      const btn = keyboard.inline_keyboard[0]![0]!;
      expect('web_app' in btn).toBe(true);
      if ('web_app' in btn) {
        expect(btn.text).toBe(t(locale, 'settings.button'));
        expect(btn.web_app.url).toContain('settings');
      }
    });
  }
});

describe('/lang prompt', () => {
  it('offers both languages', () => {
    const { keyboard } = buildLangPrompt('en');
    const row = keyboard.inline_keyboard[0]!;
    expect(row).toHaveLength(2);
    const labels = row.map((b) => ('text' in b ? b.text : ''));
    expect(labels).toContain('한국어');
    expect(labels).toContain('English');
  });
});
