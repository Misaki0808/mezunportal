import type { ComponentProps } from 'react';
import { cn } from '@/components/ui/cn';

/** Görünüm A: telefonda kart, geniş ekranda tek yüzey içinde ayrılmış satırlar. */
export function AdminList({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      {...props}
      className={cn(
        'grid min-w-0 gap-3 lg:gap-0 lg:divide-y lg:divide-border lg:rounded-card lg:border lg:border-border lg:bg-surface lg:shadow-card',
        className,
      )}
    />
  );
}
export function AdminListItem({
  className,
  flush = false,
  ...props
}: ComponentProps<'li'> & { flush?: boolean }) {
  return (
    <li
      {...props}
      className={cn(
        'min-w-0 rounded-card border border-border bg-surface shadow-card lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none',
        !flush && 'p-4 lg:px-5 lg:py-4',
        className,
      )}
    />
  );
}
