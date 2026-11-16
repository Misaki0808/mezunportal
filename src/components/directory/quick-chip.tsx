import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/components/ui';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-pressed'> & {
  selected: boolean;
};

/**
 * Hızlı süzgeç yongası (Görünüm A liste kalıbı): aç/kapa düğmesi, ≥ 44 px, seçiliyken dolu zemin. Seçili yazı rengi tema
 * belirteci (`text-on-primary`): sabit beyaz koyu temada açık mor zeminde 2,27:1 verir (kart 393).
 */
export function QuickChip({ selected, className, ...props }: Props) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'press-control inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary',
        selected
          ? 'border-primary bg-primary text-on-primary'
          : 'border-border-control bg-surface text-fg',
        className,
      )}
      {...props}
    />
  );
}
