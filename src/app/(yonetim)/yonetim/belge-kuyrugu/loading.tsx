import { getTranslations } from 'next-intl/server';

import { Skeleton, SkeletonText } from '@/components/ui';

export default async function GraduationQueueLoading() {
  const t = await getTranslations('authScreens.queue');
  return (
    <div aria-busy="true" className="min-w-0 space-y-5">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="mb-8 h-9 w-2/3" />
      <div className="rounded-card border border-border p-5">
        <SkeletonText lines={4} />
      </div>
    </div>
  );
}
