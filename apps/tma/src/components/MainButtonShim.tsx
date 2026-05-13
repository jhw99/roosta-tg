'use client';

import { useEffect } from 'react';
import { getWebApp } from '../lib/webapp';

/**
 * Binds Telegram MainButton lifecycle. If unavailable (e.g. outside Telegram),
 * also renders a fallback sticky button so the action is reachable on web.
 */
export function MainButtonShim({
  text,
  onClick,
  disabled,
  visible = true,
}: {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  visible?: boolean;
}) {
  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;
    (async () => {
      const wa = await getWebApp();
      if (!mounted || !wa) return;
      const btn = wa.MainButton;
      const handler = () => onClick();
      try {
        btn.setText(text);
        try {
          (btn as unknown as { setParams?: (p: Record<string, unknown>) => void }).setParams?.({
            color: '#E85D2F',
            text_color: '#FFFFFF',
          });
        } catch {
          // ignore — older Telegram clients may not support setParams
        }
        btn.onClick(handler);
        if (visible && !disabled) btn.show();
        else btn.hide();
        if (disabled) btn.disable();
        else btn.enable();
      } catch {
        // ignore
      }
      cleanup = () => {
        try {
          btn.offClick(handler);
          btn.hide();
        } catch {
          // ignore
        }
      };
    })();
    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [text, onClick, disabled, visible]);

  if (!visible) return null;
  return (
    <div className="sticky bottom-0 left-0 right-0 z-40 border-t border-black/5 bg-[var(--color-bg)] p-3 sm:hidden">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="w-full rounded-xl bg-[var(--color-primary)] py-3 text-sm font-medium text-white disabled:opacity-60"
      >
        {text}
      </button>
    </div>
  );
}
