'use client';

import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';

import { cn } from './cn';
import { CloseIcon } from './icons';

export type TagProps = Omit<ComponentProps<'span'>, 'children'> & {
  label: string;
  /** Verilirse etiket kaldırılabilir; kaldırma düğmesi ≥ 44 px dokunma hedefidir. */
  onRemove?: () => void;
};

/** İlgi alanı / beceri / hedef etiketi. */
export function Tag({ label, onRemove, className, ...rest }: TagProps) {
  const t = useTranslations('ui.tag');

  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center rounded-full border border-border-control bg-bg text-sm text-fg',
        onRemove ? 'pl-3' : 'px-3 py-1',
        className,
      )}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          aria-label={t('remove', { label })}
          onClick={onRemove}
          className="press-control inline-flex size-11 items-center justify-center rounded-full"
        >
          <CloseIcon width={16} height={16} />
        </button>
      )}
    </span>
  );
}
