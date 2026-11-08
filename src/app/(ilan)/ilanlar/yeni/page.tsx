import { PostingEditor } from '@/components/job-postings/editor';
import { ErrorState } from '@/components/ui';
import {
  getJobPostingFormContext,
  saveJobPostingDraft,
  submitJobPosting,
} from '@/server/actions/job-postings';
export const dynamic = 'force-dynamic';
export default async function NewPostingPage() {
  const context = await getJobPostingFormContext();
  return context.ok ? (
    <PostingEditor context={context.data} save={saveJobPostingDraft} submit={submitJobPosting} />
  ) : (
    <ErrorState errorCode={context.errorCode} />
  );
}
