import type { ReactNode } from 'react';

import { cn } from './cn';

export type IconChipTone = 'primary' | 'accent' | 'success';

const TONES: Record<IconChipTone, string> = {
  primary: 'bg-primary-soft text-on-primary-soft',
  accent: 'bg-accent-soft text-on-accent-soft',
  success: 'bg-success-soft text-on-success-soft',
};

/**
 * Renkli simge çipi: liste/kısayol kartlarında İris, Mercan ve Nane ile canlılık verir (docs/design.md "Renk dağılımı").
 * Dekoratiftir (`aria-hidden`); anlamı kartın metni taşır. Renk tek sinyal değildir.
 */
export function IconChip({
  tone = 'primary',
  children,
  className,
}: {
  tone?: IconChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-control',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
