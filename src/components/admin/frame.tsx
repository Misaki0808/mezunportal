'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';

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
      <p className="font-semibold text-primary">{t('eyebrow')}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg">{title}</h1>
      {description && <p className="mt-3 max-w-2xl text-base text-fg-muted">{description}</p>}
      <div className="mt-7">{children}</div>
    </div>
  );
}
