'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { PageHeader } from '../../components/PageHeader';
import { useStrings } from '../../hooks/useStrings';
import { useAppStore } from '../../store';
import { api, type ApiNotificationSettings } from '../../lib/api';
import { shortAddress } from '../../lib/format';
import type { Lang } from '../../i18n';

const DEFAULTS: ApiNotificationSettings = {
  reminder24h: true,
  reminder1h: false,
  roundResult: true,
  organizerDefaultAlert: true,
  groupWinner: true,
};

export default function Settings() {
  const s = useStrings();
  const lang = useAppStore((st) => st.lang);
  const setLang = useAppStore((st) => st.setLang);
  const user = useAppStore((st) => st.user);
  const [tonConnectUI] = useTonConnectUI();
  const tonAddress = useTonAddress();

  const [settings, setSettings] = useState<ApiNotificationSettings>(DEFAULTS);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Best-effort initial load via /me. If a notification-settings endpoint exists,
    // we'd call it here. For now, hold defaults.
    if (user?.language) {
      setSettings((p) => ({ ...p, language: user.language }));
    }
  }, [user]);

  const update = useCallback(
    async (patch: Partial<ApiNotificationSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      setSaving(true);
      setError(null);
      try {
        await api.updateNotificationSettings(patch);
        setSavedAt(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : s.common.error);
      } finally {
        setSaving(false);
      }
    },
    [settings, s.common.error],
  );

  const changeLang = useCallback(
    (l: Lang) => {
      setLang(l, true);
      void update({ language: l });
    },
    [setLang, update],
  );

  return (
    <main>
      <PageHeader title={s.settings.title} />

      <section className="p-4 space-y-2">
        <h2 className="text-sm font-semibold opacity-70">{s.settings.notifications}</h2>
        <Toggle
          label={s.settings.reminder24h}
          checked={settings.reminder24h}
          onChange={(v) => void update({ reminder24h: v })}
        />
        <Toggle
          label={s.settings.reminder1h}
          checked={settings.reminder1h}
          onChange={(v) => void update({ reminder1h: v })}
        />
        <Toggle
          label={s.settings.roundResult}
          checked={settings.roundResult}
          onChange={(v) => void update({ roundResult: v })}
        />
        <Toggle
          label={s.settings.organizerDefaultAlert}
          checked={settings.organizerDefaultAlert}
          onChange={(v) => void update({ organizerDefaultAlert: v })}
        />
        <Toggle
          label={s.settings.groupWinner}
          checked={settings.groupWinner}
          onChange={(v) => void update({ groupWinner: v })}
        />
      </section>

      <section className="p-4 space-y-2">
        <h2 className="text-sm font-semibold opacity-70">{s.settings.language}</h2>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['ko', s.settings.languageKo],
              ['en', s.settings.languageEn],
            ] as const
          ).map(([code, label]) => (
            <button
              key={code}
              type="button"
              onClick={() => changeLang(code)}
              className={`rounded-xl border px-3 py-2 text-sm ${
                lang === code
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                  : 'border-black/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="p-4 space-y-2">
        <h2 className="text-sm font-semibold opacity-70">{s.settings.wallet}</h2>
        {tonAddress ? (
          <div className="rounded-xl bg-[var(--color-secondary-bg)] p-3 text-sm">
            <p className="opacity-70">{s.wallet.connected}</p>
            <p className="font-medium break-all">{shortAddress(tonAddress, 6, 6)}</p>
            <button
              type="button"
              onClick={() => void tonConnectUI.disconnect()}
              className="mt-2 rounded-lg border border-red-300 px-3 py-1 text-xs text-red-700"
            >
              {s.settings.disconnect}
            </button>
          </div>
        ) : (
          <p className="text-sm opacity-70">—</p>
        )}
      </section>

      <section className="px-4 pb-8 text-xs opacity-60">
        {saving ? s.settings.saving : savedAt ? s.settings.saved : ''}
        {error && <p className="text-red-700">{error}</p>}
      </section>
    </main>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-secondary-bg)] px-3 py-2 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}
