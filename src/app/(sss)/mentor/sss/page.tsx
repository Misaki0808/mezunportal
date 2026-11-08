import { MentorRequests } from '@/components/faq/mentor-requests';
import { ErrorState } from '@/components/ui';
import { answerFaqRequest, listFaqRequestsForMentor } from '@/server/actions/faq';

export const dynamic = 'force-dynamic';

export default async function MentorFaqPage() {
  const result = await listFaqRequestsForMentor({}).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <MentorRequests
      initial={result.data}
      list={listFaqRequestsForMentor}
      answer={answerFaqRequest}
    />
  );
}
