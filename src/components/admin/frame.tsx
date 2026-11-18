'use client';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { BackLink, PageHeader } from '@/components/ui';

export function AdminFrame({
  title,
  description,
  children,
  actions,
  backHref = '/yonetim',
  backLabel,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  /** Ayrıntı sayfaları kendi listesine döner; verilmezse yönetim ana sayfası. */
  backHref?: string;
  backLabel?: string;
}) {
  const t = useTranslations('admin');
  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <div className="space-y-2">
        <BackLink href={backHref} flush>
          {backLabel ?? t('back')}
        </BackLink>
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
