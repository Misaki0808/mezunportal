import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { SearchScreen } from '@/components/search/search-screen';
import { ErrorState, buttonClasses } from '@/components/ui';
import {
  searchExperiencesSchema,
  searchFilterFromParams,
  searchFilterToParams,
} from '@/contracts/search';
import { listSearchSectors, searchExperiences } from '@/server/actions/search';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
async function Results({ params }: { params: Params }) {
  const t = await getTranslations('search');
  const parsed = searchExperiencesSchema.safeParse(searchFilterFromParams(params));
  if (!parsed.success)
    return (
      <div className="mx-auto max-w-xl px-5 py-10">
        <ErrorState errorCode="VALIDATION_INVALID" />
        <Link href="/deneyimler" className={buttonClasses({ variant: 'secondary' })}>
          {t('clear')}
        </Link>
      </div>
    );
  const [results, sectors] = await Promise.all([
    searchExperiences(parsed.data),
    listSearchSectors(),
  ]);
  if (!results.ok) return <ErrorState errorCode={results.errorCode} />;
  if (!sectors.ok) return <ErrorState errorCode={sectors.errorCode} />;
  return (
    <SearchScreen
      key={searchFilterToParams(parsed.data).toString()}
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
