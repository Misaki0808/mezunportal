import type { ComponentProps } from 'react';

import { cn } from './cn';

/**
 * Yükleniyor yer tutucusu. Dekoratiftir (`aria-hidden`); yükleme durumunu saran bölüm
 * `aria-busy="true"` taşır ve ekran okuyucuya kısa bir “Yükleniyor” metni verir.
 */
export function Skeleton({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      {...rest}
      aria-hidden="true"
      className={cn('animate-pulse rounded-control bg-surface-strong', className)}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn('h-4', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}
