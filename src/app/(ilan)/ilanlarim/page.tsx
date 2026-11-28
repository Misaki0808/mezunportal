import { MyPostings } from '@/components/job-postings/manage';
import { mayPost } from '@/components/job-postings/model';
import { ErrorState } from '@/components/ui';
import { isCodedError } from '@/lib/errors';
import { requireVerifiedMember } from '@/server/permissions';
import { closeJobPosting, listMyJobPostings } from '@/server/actions/job-postings';
export const dynamic = 'force-dynamic';
export default async function MyPostingsPage() {
  const [result, actor] = await Promise.all([
    listMyJobPostings({}),
    requireVerifiedMember().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({
        ok: false as const,
        errorCode: isCodedError(error) ? error.code : ('SERVER_UNEXPECTED' as const),
      }),
    ),
  ]);
  if (!actor.ok) return <ErrorState errorCode={actor.errorCode} />;
  return result.ok ? (
    <MyPostings
      initial={result.data}
      canPost={mayPost(actor.value.facts.memberships, new Date())}
      close={closeJobPosting}
      list={listMyJobPostings}
    />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}
