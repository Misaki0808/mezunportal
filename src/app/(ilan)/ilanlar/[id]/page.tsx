import { PostingDetail } from '@/components/job-postings/detail';
import { ErrorState } from '@/components/ui';
import { getJobPosting } from '@/server/actions/job-postings-preview';
export const dynamic = 'force-dynamic';
export default async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getJobPosting({ id });
  return result.ok ? (
    <PostingDetail posting={result.data} />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}
