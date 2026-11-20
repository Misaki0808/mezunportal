import { redirect } from 'next/navigation';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { SearchScreen } from '@/components/search/search-screen';
import { ErrorState } from '@/components/ui';
import {
  SEARCH_PAGE_MAX,
  searchExperiencesSchema,
  searchFilterFromParams,
  searchFilterToParams,
} from '@/contracts/search';
import { capPage, lastPageIfPast, parseListFilters } from '@/lib/list-params';
import { listSearchSectors, searchExperiences } from '@/server/actions/search';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
async function Results({ params }: { params: Params }) {
  // Geçersiz parametre sessizce varsayılana düşer; aralık dışı sayfa son geçerli sayfaya çekilir (aşağıda).
  const parsed = parseListFilters(
    searchExperiencesSchema,
    capPage(searchFilterFromParams(params), SEARCH_PAGE_MAX),
  );
  const [results, sectors] = await Promise.all([searchExperiences(parsed), listSearchSectors()]);
  if (!results.ok) return <ErrorState errorCode={results.errorCode} />;
  if (!sectors.ok) return <ErrorState errorCode={sectors.errorCode} />;
  const last = lastPageIfPast(parsed.page, results.data.total, results.data.pageSize);
  if (last !== null) {
    const next = searchFilterToParams({ ...parsed, page: last });
    redirect(`/deneyimler${next.size ? `?${next}` : ''}`);
  }
  return (
    <SearchScreen
      key={searchFilterToParams(parsed).toString()}
      filter={parsed}
      results={results.data}
      sectors={sectors.data.sectors}
    />
  );
}
export default async function SearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return (
    <PrivacyGuard>
      <Results params={params} />
    </PrivacyGuard>
  );
}
