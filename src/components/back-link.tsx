import Link from 'next/link';
import type { ReactNode } from 'react';

import { ChevronLeftIcon } from '@/components/ui';

export function BackLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`press-row -ml-2 inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-base font-medium text-primary hover:bg-primary-soft hover:text-on-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
    >
      <ChevronLeftIcon aria-hidden="true" />
      {children}
    </Link>
  );
}
