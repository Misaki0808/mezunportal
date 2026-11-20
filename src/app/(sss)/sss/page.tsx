import { redirect } from 'next/navigation';
import { FaqList } from '@/components/faq/faq-list';
import { ErrorState } from '@/components/ui';
import { searchFaqSchema } from '@/contracts/faq';
import { capPage, lastPageIfPast, parseListFilters } from '@/lib/list-params';
import { searchFaq } from '@/server/actions/faq';
import { requireVerifiedMember } from '@/server/permissions';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function FaqPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const rawQuery = first(params.q)?.trim();
  const rawPage = first(params.page)?.trim();
  // Geçersiz parametre sessizce varsayılana düşer; aralık dışı sayfa son geçerli sayfaya çekilir (aşağıda).
  const input = parseListFilters(
    searchFaqSchema,
    capPage(
      {
        ...(rawQuery ? { q: rawQuery } : {}),
        ...(rawPage ? { page: Number(rawPage) } : {}),
      },
      200,
    ),
  );
  const result = await searchFaq(input).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const last = lastPageIfPast(input.page, result.data.total, result.data.pageSize);
  if (last !== null) {
    const next = new URLSearchParams();
    if (input.q) next.set('q', input.q);
    if (last > 1) next.set('page', String(last));
    redirect(`/sss${next.size ? `?${next}` : ''}`);
  }
  const canAsk = await requireVerifiedMember({ roles: ['STUDENT'] }).then(
    () => true,
    () => false,
  );
  return <FaqList result={result.data} q={input.q} canAsk={canAsk} />;
}
