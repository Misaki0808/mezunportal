'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui';

export function AdminFrame({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const t = useTranslations('admin');
  return (
    <div className="mx-auto min-w-0 w-full max-w-6xl px-5 pb-12 pt-10 [overflow-wrap:anywhere] sm:pt-14">
      <Link
        href="/yonetim"
        className="press-row mb-5 inline-flex min-h-11 items-center font-medium text-primary"
      >
        ← {t('back')}
      </Link>
      <PageHeader eyebrow={t('eyebrow')} title={title} description={description} />
      <div className="mt-7">{children}</div>
    </div>
  );
}
