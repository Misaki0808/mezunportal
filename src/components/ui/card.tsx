import type { ElementType, HTMLAttributes } from 'react';

import { cn } from './cn';

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType<HTMLAttributes<HTMLElement>>;
  padding?: 'none' | 'sm' | 'md';
  /** Tıklanabilir kart (bağlantı/düğme içeren sarmalayıcı): basınca yalnız hafifçe küçülür. */
  interactive?: boolean;
};

const PADDING = { none: '', sm: 'p-3', md: 'p-4 sm:p-5' } as const;

export function Card({
  as: Tag = 'div',
  padding = 'md',
  interactive = false,
  className,
  ...rest
}: CardProps) {
  return (
    <Tag
      {...rest}
      className={cn(
        'rounded-card border border-border bg-bg shadow-card',
        PADDING[padding],
        interactive && 'press-control cursor-pointer hover:border-border-control',
        className,
      )}
    />
  );
}
