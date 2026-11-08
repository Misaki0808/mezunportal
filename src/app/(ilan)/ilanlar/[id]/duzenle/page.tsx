import { PostingEditor } from '@/components/job-postings/editor';
import { ErrorState } from '@/components/ui';
import {
  getJobPostingFormContext,
  listMyJobPostings,
  saveJobPostingDraft,
  submitJobPosting,
} from '@/server/actions/job-postings';
export const dynamic = 'force-dynamic';
export default async function EditPostingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getJobPostingFormContext();
  if (!context.ok) return <ErrorState errorCode={context.errorCode} />;
  let cursor: string | undefined;
  const seen = new Set<string>();
  do {
    const page = await listMyJobPostings({ cursor, limit: 50 });
    if (!page.ok) return <ErrorState errorCode={page.errorCode} />;
    const item = page.data.items.find((p) => p.id === id);
    if (item)
      return (
        <PostingEditor
          context={context.data}
          initial={item}
          save={saveJobPostingDraft}
          submit={submitJobPosting}
        />
      );
    cursor = page.data.nextCursor ?? undefined;
    if (cursor && seen.has(cursor)) break;
    if (cursor) seen.add(cursor);
  } while (cursor);
  return <ErrorState errorCode="RESOURCE_NOT_FOUND" />;
}
