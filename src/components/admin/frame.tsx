'use client';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { BackLink } from '@/components/back-link';
import { PageHeader } from '@/components/ui';

export function AdminFrame({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const t = useTranslations('admin');
  return (
    <div className="min-w-0 space-y-6 pb-8 [overflow-wrap:anywhere]">
      <div className="space-y-2">
        <BackLink href="/yonetim">{t('back')}</BackLink>
        <PageHeader
          eyebrow={t('eyebrow')}
          title={title}
          description={description}
          actions={actions}
        />
      </div>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
