import { PrivacyGuard } from '@/components/privacy/server-guard';
import { MentorDirectory } from '@/components/mentors/mentor-directory';
import { ResetLink } from '@/components/directory/reset-link';
import { ErrorState } from '@/components/ui';
import {
  mentorFilterFromParams,
  mentorFilterToParams,
  searchMentorsSchema,
} from '@/contracts/mentor-directory';
import { getSimilarMentors, searchMentors } from '@/server/actions/mentor-directory';
import { listSearchSectors } from '@/server/actions/search';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;

async function Results({ params }: { params: Params }) {
  const parsed = searchMentorsSchema.safeParse(mentorFilterFromParams(params));
  if (!parsed.success) {
    return (
      <div className="mx-auto max-w-xl px-5 py-10">
        <ErrorState errorCode="VALIDATION_INVALID" />
        <ResetLink href="/mentorlar" />
      </div>
    );
  }
  const filtered = mentorFilterToParams(parsed.data).toString() !== '';
  const [results, sectors, similar] = await Promise.all([
    searchMentors(parsed.data),
    listSearchSectors(),
    // “Sana benzer” yalnız filtresiz ilk sayfada gösterilir (filtreleri bölmesin).
    filtered ? Promise.resolve(null) : getSimilarMentors(),
  ]);
  if (!results.ok) return <ErrorState errorCode={results.errorCode} />;
  // Sektör listesi ya da öneriler yüklenemezse sayfa yine çalışır (süzgeç/öneri kapanır).
  return (
    <MentorDirectory
      key={mentorFilterToParams(parsed.data).toString()}
      filter={parsed.data}
      results={results.data}
      sectors={sectors.ok ? sectors.data.sectors : []}
      similar={similar?.ok ? similar.data : null}
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
