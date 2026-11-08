import { PrivacyGuard } from '@/components/privacy/server-guard';
import { SearchScreen } from '@/components/search/search-screen';
import { ErrorState } from '@/components/ui';
import { redirect } from 'next/navigation';
import {
  searchExperiencesSchema,
  searchFilterFromParams,
  searchFilterToParams,
} from '@/contracts/search';
import { listSearchSectors, searchExperiences } from '@/server/actions/search';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
async function Results({ params }: { params: Params }) {
  const parsed = searchExperiencesSchema.safeParse(searchFilterFromParams(params));
  if (!parsed.success) redirect('/deneyimler?filtreler=temizlendi');
  const [results, sectors] = await Promise.all([
    searchExperiences(parsed.data),
    listSearchSectors(),
  ]);
  if (!results.ok) return <ErrorState errorCode={results.errorCode} />;
  if (!sectors.ok) return <ErrorState errorCode={sectors.errorCode} />;
  return (
    <SearchScreen
      key={`${searchFilterToParams(parsed.data).toString()}-${params.filtreler === 'temizlendi'}`}
      filtersReset={params.filtreler === 'temizlendi'}
      filter={parsed.data}
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
