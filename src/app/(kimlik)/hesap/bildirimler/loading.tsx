import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui';
export default async function Loading() {
  const t = await getTranslations('notifications');
  return (
    <div aria-busy="true" className="mx-auto max-w-2xl px-5 py-10">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-10 w-56" />
      <Skeleton className="mt-5 h-80 w-full" />
    </div>
  );
}
