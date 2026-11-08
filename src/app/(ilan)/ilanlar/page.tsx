import { PostingList } from '@/components/job-postings/list';
import { mayPost, parseJobFilters } from '@/components/job-postings/model';
import { ErrorState } from '@/components/ui';
import { requireVerifiedMember } from '@/server/permissions';
import {
  getJobPostingFilterOptions,
  searchJobPostings,
} from '@/server/actions/job-postings-preview';
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
  const filters = parseJobFilters(params);
  const [actor, result, options] = await Promise.all([
    requireVerifiedMember().catch(() => null),
    searchJobPostings(filters).catch(() => null),
    getJobPostingFilterOptions().catch(() => null),
  ]);
  if (!actor || !result || !options) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  if (!options.ok) return <ErrorState errorCode={options.errorCode} />;
  return (
    <PostingList
      page={result.data}
      filters={filters}
      options={options.data}
      canPost={mayPost(actor.facts.memberships)}
    />
  );
}
