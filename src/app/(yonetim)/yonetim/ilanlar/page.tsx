import { PostingModeration } from '@/components/job-postings/manage';
import { hasAdminAccess } from '@/components/layout/admin-access';
import { ErrorState } from '@/components/ui';
import {
  listJobPostingModerationQueue,
  reviewJobPosting,
} from '@/server/actions/job-postings-preview';
export const dynamic = 'force-dynamic';
export default async function PostingQueuePage() {
  if (!(await hasAdminAccess())) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const result = await listJobPostingModerationQueue({});
  return result.ok ? (
    <PostingModeration
      initial={result.data}
      review={reviewJobPosting}
      list={listJobPostingModerationQueue}
    />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}
