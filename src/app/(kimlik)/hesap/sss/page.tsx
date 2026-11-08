import { StudentFaq } from '@/components/faq/student-faq';
import { ErrorState } from '@/components/ui';
import { listMyFaqRequests, submitFaqRequest, suggestSimilarFaqs } from '@/server/actions/faq';

export const dynamic = 'force-dynamic';

export default async function MyFaqRequestsPage() {
  const result = await listMyFaqRequests({}).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <StudentFaq
      initial={result.data}
      suggest={suggestSimilarFaqs}
      submit={submitFaqRequest}
      list={listMyFaqRequests}
    />
  );
}
