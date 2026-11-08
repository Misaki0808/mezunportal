import { useTranslations } from 'next-intl';

import { Skeleton, SkeletonText } from './skeleton';

/**
 * Yükleniyor iskeleti: sayfa başlığı + birkaç kart (her sayfaya özel iskelet yazmadan ortak biçim). Rota grubu düzeyindeki `loading.tsx`
 * bunu kullanır; daha özel bir `loading.tsx` varsa o önceliklidir. Erişilebilirlik: kapsayıcı `aria-busy`, ekran okuyucuya kısa metin.
 */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  const t = useTranslations('ui.page');
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-9 w-2/3" />
      <SkeletonText lines={2} className="mt-4" />
      <div className="mt-8 flex flex-col gap-3">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="rounded-card border border-border p-4 shadow-card">
            <Skeleton className="mb-3 h-5 w-1/2" />
            <SkeletonText lines={2} />
          </div>
        ))}
      </div>
    </div>
  );
}
