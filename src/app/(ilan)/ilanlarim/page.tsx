import { MyPostings } from '@/components/job-postings/manage';
import { ErrorState } from '@/components/ui';
import { closeJobPosting, listMyJobPostings } from '@/server/actions/job-postings';
export const dynamic = 'force-dynamic';
export default async function MyPostingsPage() {
  const result = await listMyJobPostings({});
  return result.ok ? (
    <MyPostings initial={result.data} close={closeJobPosting} list={listMyJobPostings} />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}
