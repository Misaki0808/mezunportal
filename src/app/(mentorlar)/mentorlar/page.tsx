import { redirect } from 'next/navigation';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { MentorDirectory } from '@/components/mentors/mentor-directory';
import { ErrorState } from '@/components/ui';
import {
  MENTOR_PAGE_MAX,
  mentorFilterFromParams,
  mentorFilterToParams,
  searchMentorsSchema,
} from '@/contracts/mentor-directory';
import { capPage, lastPageIfPast, parseListFilters } from '@/lib/list-params';
import { getMyMentorSettings } from '@/server/actions/appointment';
import { getSimilarMentors, searchMentors } from '@/server/actions/mentor-directory';
import { listSearchSectors } from '@/server/actions/search';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;

async function Results({ params }: { params: Params }) {
  // Geçersiz parametre sessizce varsayılana düşer; aralık dışı sayfa son geçerli sayfaya çekilir (aşağıda).
  const parsed = parseListFilters(
    searchMentorsSchema,
    capPage(mentorFilterFromParams(params), MENTOR_PAGE_MAX),
  );
  const filtered = mentorFilterToParams(parsed).toString() !== '';
  const [results, sectors, similar, mine] = await Promise.all([
    searchMentors(parsed),
    listSearchSectors(),
    // “Sana benzer” yalnız filtresiz ilk sayfada gösterilir (filtreleri bölmesin).
    filtered ? Promise.resolve(null) : getSimilarMentors(),
    // Boş dizinde rolüne uygun eylem için: mentor olabilir mi, profili açık mı?
    getMyMentorSettings().catch(() => null),
  ]);
  if (!results.ok) return <ErrorState errorCode={results.errorCode} />;
  const last = lastPageIfPast(parsed.page, results.data.total, results.data.pageSize);
  if (last !== null) {
    const next = mentorFilterToParams({ ...parsed, page: last });
    redirect(`/mentorlar${next.size ? `?${next}` : ''}`);
  }
  // Sektör listesi ya da öneriler yüklenemezse sayfa yine çalışır (süzgeç/öneri kapanır).
  return (
    <MentorDirectory
      key={mentorFilterToParams(parsed).toString()}
      filter={parsed}
      results={results.data}
      sectors={sectors.ok ? sectors.data.sectors : []}
      similar={similar?.ok ? similar.data : null}
      canOpenMentoring={Boolean(mine?.ok && mine.data.eligible && !mine.data.settings?.isActive)}
    />
  );
}

export default async function MentorsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return (
    <PrivacyGuard>
      <Results params={params} />
    </PrivacyGuard>
  );
}
