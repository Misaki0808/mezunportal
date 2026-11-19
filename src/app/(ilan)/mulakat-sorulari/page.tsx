import { redirect } from 'next/navigation';
import { QuestionBank } from '@/components/interview-questions/question-bank';
import { ErrorState } from '@/components/ui';
import { interviewQuerySchema } from '@/contracts/interview-questions';
import { capPage, lastPageIfPast, parseListFilters } from '@/lib/list-params';
import { getInterviewQuestions } from '@/server/actions/interview-questions';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  // Geçersiz parametre sessizce varsayılana düşer; aralık dışı sayfa son geçerli sayfaya çekilir (aşağıda).
  const filters = parseListFilters(
    interviewQuerySchema,
    capPage(
      {
        q: raw.q ?? '',
        companyId: raw.companyId ?? '',
        sectorId: raw.sectorId ?? '',
        ...(raw.page === undefined ? {} : { page: raw.page }),
      },
      10000,
    ),
  );
  const result = await getInterviewQuestions(filters);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const last = lastPageIfPast(filters.page ?? 1, result.data.total, result.data.pageSize);
  if (last !== null) {
    const next = new URLSearchParams();
    for (const key of ['q', 'companyId', 'sectorId'] as const)
      if (filters[key]) next.set(key, filters[key]);
    if (last > 1) next.set('page', String(last));
    redirect(`/mulakat-sorulari${next.size ? `?${next}` : ''}`);
  }
  return <QuestionBank data={result.data} filters={filters} />;
}
