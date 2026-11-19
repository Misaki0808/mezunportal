import { notFound } from 'next/navigation';
import { PostingEditor } from '@/components/job-postings/editor';
import { ErrorState } from '@/components/ui';
import { requestEditablePosting } from '@/app/detail-route';
import {
  getJobPostingFormContext,
  saveJobPostingDraft,
  submitJobPosting,
} from '@/server/actions/job-postings';
export const dynamic = 'force-dynamic';
export default async function EditPostingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getJobPostingFormContext();
  if (!context.ok) return <ErrorState errorCode={context.errorCode} />;
  const result = await requestEditablePosting(id);
  if (!result.ok && result.errorCode === 'RESOURCE_NOT_FOUND') notFound();
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <PostingEditor
      context={context.data}
      initial={result.data}
      save={saveJobPostingDraft}
      submit={submitJobPosting}
    />
  );
}
