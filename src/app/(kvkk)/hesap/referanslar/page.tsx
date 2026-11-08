import { ReferralList } from '@/components/referrals/referral-ui';
import { ErrorState } from '@/components/ui';
import { listMyReferrals } from '@/server/actions/referrals';
import { requireVerifiedMember } from '@/server/permissions';
export const dynamic = 'force-dynamic';
export default async function MyReferralsPage() {
  const actor = await requireVerifiedMember().catch(() => null);
  if (!actor) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const result = await listMyReferrals({});
  const canCreate = actor.facts.memberships.some(
    (m) => m.role === 'ALUMNI' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
  );
  return result.ok ? (
    <ReferralList initial={result.data} userId={actor.userId} canCreate={canCreate} />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}
