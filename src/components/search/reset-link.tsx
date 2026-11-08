'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui';

/** Hata sayfasındaki istemciye ait düğme stilini sunucu bileşeninden çağırmaz. */
export function ResetLink() {
  const t = useTranslations('search');
  return (
    <Link href="/deneyimler" className={buttonClasses({ variant: 'secondary' })}>
      {t('clear')}
    </Link>
  );
}
