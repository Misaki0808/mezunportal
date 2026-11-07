'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonClasses } from '@/components/ui';

export function ActionLink({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={buttonClasses({
        variant: secondary ? 'secondary' : 'primary',
        fullWidth: true,
        size: 'lg',
      })}
    >
      {children}
    </Link>
  );
}
