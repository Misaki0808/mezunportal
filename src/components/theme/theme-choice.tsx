'use client';

import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';

import { MonitorIcon, MoonIcon, SunIcon, cn } from '@/components/ui';
import { THEMES, type Theme } from '@/lib/theme';

import { getDocumentTheme, setTheme, subscribeTheme } from './theme-client';

const ICONS = { system: MonitorIcon, light: SunIcon, dark: MoonIcon } as const;

/**
 * `/hesap` altındaki üçlü seçim: Sistem / Açık / Koyu. Her seçenek bir `aria-pressed` düğmesidir (seçili olan basılı).
 * `initial` sunucunun çerezden okuduğu değerdir; ilk çizimde (hidrasyon) o kullanılır, sonra öznitelik dinlenir.
 */
export function ThemeChoice({ initial, labelledBy }: { initial: Theme; labelledBy: string }) {
  const t = useTranslations('theme');
  const current = useSyncExternalStore(subscribeTheme, getDocumentTheme, () => initial);
  return (
    <div className="mt-3">
      <p className="text-base text-fg-muted">{t('choiceHint')}</p>
      <div role="group" aria-labelledby={labelledBy} className="mt-3 grid grid-cols-3 gap-2">
        {THEMES.map((theme) => {
          const Icon = ICONS[theme];
          const selected = current === theme;
          return (
            <button
              key={theme}
              type="button"
              aria-pressed={selected}
              onClick={() => setTheme(theme)}
              className={cn(
                'press-control inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-3 text-base font-medium',
                selected
                  ? 'border-primary bg-primary-soft text-on-primary-soft'
                  : 'border-border-control bg-bg text-fg hover:bg-surface-strong',
              )}
            >
              <Icon />
              <span>{t(`options.${theme}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
