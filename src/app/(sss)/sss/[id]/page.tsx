import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { FaqItemCard } from '@/components/faq/faq-list';
import { ErrorState } from '@/components/ui';
import { FAQ_PAGE_HREF } from '@/contracts/faq';
import { getFaqItem } from '@/server/actions/faq';

export const dynamic = 'force-dynamic';

export default async function FaqItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getFaqItem({ id }).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  // Var olmayan ya da görünmeyen kayıt aynı yanıtı alır (sunucu RESOURCE_NOT_FOUND döner).
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const t = await getTranslations('faq');
  return (
    <div className="mx-auto w-full max-w-3xl min-w-0 px-5 pb-12 pt-10 sm:pt-14">
      <Link
        href={FAQ_PAGE_HREF}
        className="press-row mb-5 inline-flex min-h-11 items-center font-medium text-primary"
      >
        ← {t('backToList')}
      </Link>
      <FaqItemCard item={result.data} open />
    </div>
  );
}
