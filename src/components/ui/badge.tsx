import type { ComponentProps } from 'react';

import { cn } from './cn';

export type BadgeTone = 'neutral' | 'info' | 'accent' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-strong text-fg',
  info: 'bg-primary-soft text-on-primary-soft',
  /** Mercan: öne çıkan/yeni durumlar (az kullanılır). */
  accent: 'bg-accent-soft text-on-accent-soft',
  success: 'bg-success-soft text-on-success-soft',
  warning: 'bg-warning-soft text-on-warning-soft',
  danger: 'bg-danger-soft text-on-danger-soft',
};

/** Durum rozeti: renk + METİN birlikte; renk tek sinyal değildir (docs/design.md). */
export function Badge({
  tone = 'neutral',
  className,
  ...rest
}: ComponentProps<'span'> & { tone?: BadgeTone }) {
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium',
        TONES[tone],
        className,
      )}
    />
  );
}
