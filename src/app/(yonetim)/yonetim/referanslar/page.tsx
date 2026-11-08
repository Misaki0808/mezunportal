import { ReferralList } from '@/components/referrals/referral-ui';
import { ErrorState } from '@/components/ui';
import { listReferralModeration } from '@/server/actions/referrals';
import { requireAnyAdmin } from '@/server/permissions';
export const dynamic = 'force-dynamic';
export default async function ReferralModerationPage() {
  const actor = await requireAnyAdmin().catch(() => null);
  if (!actor) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const result = await listReferralModeration({});
  return result.ok ? (
    <ReferralList initial={result.data} userId={actor.userId} moderation />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}
