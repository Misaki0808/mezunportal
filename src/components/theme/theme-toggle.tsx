'use client';

import { useSyncExternalStore } from 'react';

import { IconButton, MoonIcon, SunIcon } from '@/components/ui';

import { getEffectiveTheme, setTheme, subscribeTheme } from './theme-client';

/**
 * Üst çubuktaki güneş-ay düğmesi: Açık ↔ Koyu. Simge CSS ile seçilir (`dark:` varyantı, `globals.css`), yani sunucudan gelen
 * ilk boyamada da doğru görünür; erişilebilir ad ise gerçek durumdan (istemci) gelir. `Sistem`e dönüş `/hesap` altındadır.
 * Metinler çağıranın verdiği `labels`tandır (tanıtım sayfası sunucu bileşenidir, istemci çeviri bağlamı varsayılmaz).
 */
export type ThemeToggleLabels = { toLight: string; toDark: string };

export function ThemeToggle({
  labels,
  className,
}: {
  labels: ThemeToggleLabels;
  className?: string;
}) {
  const effective = useSyncExternalStore(subscribeTheme, getEffectiveTheme, () => 'light' as const);
  const toLight = effective === 'dark';
  return (
    <IconButton
      className={className}
      label={toLight ? labels.toLight : labels.toDark}
      icon={
        <>
          <SunIcon className="hidden dark:block" />
          <MoonIcon className="block dark:hidden" />
        </>
      }
      onClick={() => setTheme(toLight ? 'light' : 'dark')}
    />
  );
}
