import { MentorRequests } from '@/components/faq/mentor-requests';
import { MentorSetupNotice } from '@/components/faq/mentor-setup-notice';
import { ErrorState } from '@/components/ui';
import { getMyMentorSettings } from '@/server/actions/appointment';
import { answerFaqRequest, listFaqRequestsForMentor } from '@/server/actions/faq';

export const dynamic = 'force-dynamic';

export default async function MentorFaqPage() {
  const result = await listFaqRequestsForMentor({}).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) {
    // Mentor olabilen ama etkin mentor profili olmayan kullanıcı rol uyarısı yerine ayara yönlendirilir.
    if (result.errorCode === 'AUTH_FORBIDDEN') {
      const settings = await getMyMentorSettings().catch(() => null);
      if (settings?.ok && settings.data.eligible && !settings.data.settings?.isActive)
        return <MentorSetupNotice />;
    }
    return <ErrorState errorCode={result.errorCode} />;
  }
  return (
    <MentorRequests
      initial={result.data}
      list={listFaqRequestsForMentor}
      answer={answerFaqRequest}
    />
  );
}
