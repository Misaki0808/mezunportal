import { getTranslations } from 'next-intl/server';
import { Skeleton, SkeletonText } from '@/components/ui';
export default async function PrivacyLoading() {
  const t = await getTranslations('privacyScreens.common');
  return (
    <div aria-busy="true" className="w-full max-w-2xl space-y-6">
      <span role="status" className="sr-only">
        {t('loading')}
      </span>
      <Skeleton className="h-10 w-2/3" />
      <SkeletonText lines={2} />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
