import { guardPage } from '@/server/permissions/page-guard';
import { ErrorState } from '@/components/ui';
import { requirePageVerifiedMember as requireVerifiedMember } from '@/server/permissions';
import { listCvReviewRequests, getCvReviewSettings } from '@/server/actions/cv-review-request';
import { ReviewInbox } from '@/components/cv-review/review-inbox';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const guarded = await guardPage(
    'page.cvReview',
    () => requireVerifiedMember(),
    'AUTH_UNAUTHENTICATED',
  );
  if (!guarded.ok) return <ErrorState errorCode={guarded.errorCode} />;
  const actor = guarded.value;
  const student = actor.facts.memberships.some(
    (m) => m.role === 'STUDENT' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
  );
  const mentor = actor.facts.mentor?.isActive === true;
  const [sent, received, settings] = await Promise.all([
    student ? listCvReviewRequests({ role: 'STUDENT' }) : null,
    mentor ? listCvReviewRequests({ role: 'MENTOR' }) : null,
    mentor ? getCvReviewSettings() : null,
  ]);
  const failed = [sent, received, settings].find((r) => r && !r.ok);
  if (failed && !failed.ok) return <ErrorState errorCode={failed.errorCode} />;
  return (
    <ReviewInbox
      sent={sent?.ok ? sent.data : null}
      received={received?.ok ? received.data : null}
      initialSettings={settings?.ok ? settings.data : null}
    />
  );
}
