import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { FaqItemCard } from '@/components/faq/faq-list';
import { BackLink, ErrorState } from '@/components/ui';
import { FAQ_PAGE_HREF } from '@/contracts/faq';
import { requestFaqDetail } from '@/app/detail-route';

export const dynamic = 'force-dynamic';

export default async function FaqItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requestFaqDetail(id).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  // Var olmayan ya da görünmeyen kayıt aynı yanıtı alır (sunucu RESOURCE_NOT_FOUND döner).
  if (!result.ok && result.errorCode === 'RESOURCE_NOT_FOUND') notFound();
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const t = await getTranslations('faq');
  return (
    <div className="w-full min-w-0 max-w-3xl">
      <BackLink href={FAQ_PAGE_HREF}>{t('backToList')}</BackLink>
      <FaqItemCard item={result.data} open />
    </div>
  );
}
