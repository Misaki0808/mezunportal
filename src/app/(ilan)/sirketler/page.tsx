import { CompaniesIndex } from '@/components/companies/company-screens';
import { ErrorState } from '@/components/ui';
import { searchCompanies } from '@/server/actions/companies';
export const dynamic = 'force-dynamic';
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const raw = (await searchParams).q;
  const query = typeof raw === 'string' ? raw.slice(0, 100) : '';
  const result = await searchCompanies({ q: query });
  return result.ok ? (
    <CompaniesIndex data={result.data} query={query} />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}
