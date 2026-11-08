import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui';
export default async function Loading() {
  const t = await getTranslations('jobs');
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-12" aria-busy="true">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
    </div>
  );
}
