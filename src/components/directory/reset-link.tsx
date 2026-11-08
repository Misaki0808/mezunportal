'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { buttonClasses } from '@/components/ui';

/** Geçersiz filtre adresinde “Filtreleri temizle”: `buttonClasses` istemci işlevidir, sunucu sayfası doğrudan çağıramaz. */
export function ResetLink({ href }: { href: string }) {
  const t = useTranslations('directory');
  return (
    <Link href={href} className={buttonClasses({ variant: 'secondary' })}>
      {t('clear')}
    </Link>
  );
}
