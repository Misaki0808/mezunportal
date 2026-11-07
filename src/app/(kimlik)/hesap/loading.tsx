import { getTranslations } from 'next-intl/server';

import { Skeleton, SkeletonText } from '@/components/ui';

export default async function AccountLoading() {
  const t = await getTranslations('authScreens.verification');
  return (
    <div aria-busy="true" className="mx-auto max-w-2xl px-5 py-10">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="mb-8 h-9 w-2/3" />
      <div className="rounded-card border border-border p-5">
        <SkeletonText lines={4} />
      </div>
    </div>
  );
}
