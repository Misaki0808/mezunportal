import { getTranslations } from 'next-intl/server';

import { Skeleton, SkeletonText } from '@/components/ui';

export default async function VerificationLoading() {
  const t = await getTranslations('authScreens.verification');
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-lg px-5 pt-12">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="mb-8 h-9 w-2/3" />
      <div className="rounded-card border border-border p-5">
        <SkeletonText lines={3} />
      </div>
    </div>
  );
}
