import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui';

export default async function AdminLoading() {
  const t = await getTranslations('admin');
  return (
    <div aria-busy="true" className="mx-auto max-w-6xl px-5 py-10">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-10 w-48" />
      <Skeleton className="mt-6 h-14 w-full" />
      <Skeleton className="mt-4 h-36 w-full" />
      <Skeleton className="mt-4 h-36 w-full" />
    </div>
  );
}
