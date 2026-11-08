import { getTranslations } from 'next-intl/server';

import { Skeleton } from '@/components/ui';

export default async function Loading() {
  const t = await getTranslations('directory');
  return (
    <div className="mx-auto max-w-5xl px-5 py-10" aria-busy="true">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="mb-6 h-10 w-48" />
      <Skeleton className="mb-5 h-12 w-full" />
      <Skeleton className="mb-4 h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
