import { redirect } from 'next/navigation';
import { CompaniesIndex } from '@/components/companies/company-screens';
import { ErrorState } from '@/components/ui';
import { COMPANY_PAGE_MAX, searchCompaniesSchema } from '@/contracts/companies';
import { capPage, parseListFilters } from '@/lib/list-params';
import { searchCompanies } from '@/server/actions/companies';
export const dynamic = 'force-dynamic';
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const raw = await searchParams;
  const page =
    typeof raw.page === 'string' && raw.page.trim() !== '' ? Number(raw.page) : undefined;
  // Geçersiz parametre sessizce varsayılana düşer; aralık dışı sayfa son geçerli sayfaya çekilir (aşağıda).
  const { q: query, page: requested } = parseListFilters(
    searchCompaniesSchema,
    capPage(
      {
        ...(typeof raw.q === 'string' ? { q: raw.q.slice(0, 100) } : {}),
        ...(page === undefined ? {} : { page }),
      },
      COMPANY_PAGE_MAX,
    ),
  );
  const result = await searchCompanies({ q: query, page: requested });
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  if (result.data.page < requested) {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (result.data.page > 1) next.set('page', String(result.data.page));
    redirect(`/sirketler${next.size ? `?${next}` : ''}`);
  }
  return <CompaniesIndex data={result.data} query={query} />;
}
