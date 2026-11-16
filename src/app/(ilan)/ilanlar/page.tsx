import { PostingList } from '@/components/job-postings/list';
import { mayPost, parseJobFilters } from '@/components/job-postings/model';
import { ErrorState } from '@/components/ui';
import { requireVerifiedMember } from '@/server/permissions';
import { isCodedError } from '@/lib/errors';
import { getJobPostingFilterOptions, searchJobPostings } from '@/server/actions/job-postings';
import { listSearchSectors } from '@/server/actions/search';
export const dynamic = 'force-dynamic';
export default async function PostingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw))
    if (typeof value === 'string') params.set(key, value);
  const [actor, options, sectors] = await Promise.all([
    requireVerifiedMember().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({
        ok: false as const,
        errorCode: isCodedError(error) ? error.code : ('SERVER_UNEXPECTED' as const),
      }),
    ),
    getJobPostingFilterOptions().catch(() => null),
    listSearchSectors().catch(() => null),
  ]);
  if (!actor.ok) return <ErrorState errorCode={actor.errorCode} />;
  if (!sectors) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!sectors.ok) return <ErrorState errorCode={sectors.errorCode} />;
  if (!options) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!options.ok) return <ErrorState errorCode={options.errorCode} />;
  const filters = parseJobFilters(params, options.data.organizations);
  const result = await searchJobPostings(filters).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <PostingList
      key={JSON.stringify(filters)}
      page={result.data}
      filters={filters}
      options={options.data}
      sectors={sectors.data.sectors}
      canPost={mayPost(actor.value.facts.memberships)}
    />
  );
}
