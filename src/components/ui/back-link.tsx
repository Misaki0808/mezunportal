import Link from 'next/link';
import type { ComponentProps } from 'react';

import { cn } from './cn';
import { ChevronLeftIcon } from './icons';

/**
 * Geri bağlantısı (Görünüm A): ok simgesi + metin, ≥ 44 px, üzerine gelince açık İris zemin. Hesap alt sayfaları
 * (`AccountFrame`) ve içerik ekranları aynı bağlantıyı kullanır; sayfa kendi `← metin` bağlantısını yazmaz.
 */
export function BackLink({
  className,
  children,
  flush = false,
  ...props
}: Omit<ComponentProps<typeof Link>, 'children'> & {
  children: string;
  /** Alt boşluk yok: üst öğe aralığı (`space-y-*`) verdiğinde. Sınıf çakışması çözülmediği için `mb-0` verilmez. */
  flush?: boolean;
}) {
  return (
    <Link
      className={cn(
        'press-row -ml-2 inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-base font-medium text-primary hover:bg-primary-soft hover:text-on-primary-soft',
        flush ? null : 'mb-3',
        className,
      )}
      {...props}
    >
      <ChevronLeftIcon aria-hidden="true" />
      {children}
    </Link>
  );
}
