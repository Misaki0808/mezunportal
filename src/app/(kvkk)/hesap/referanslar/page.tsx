import { guardPage } from '@/server/permissions/page-guard';
import { ReferralList } from '@/components/referrals/referral-ui';
import { ErrorState } from '@/components/ui';
import { listMyReferrals } from '@/server/actions/referrals';
import { requirePageVerifiedMember as requireVerifiedMember } from '@/server/permissions';
export const dynamic = 'force-dynamic';
export default async function MyReferralsPage() {
  const guarded = await guardPage(
    'page.myReferrals',
    () => requireVerifiedMember(),
    'AUTH_FORBIDDEN',
  );
  if (!guarded.ok) return <ErrorState errorCode={guarded.errorCode} />;
  const actor = guarded.value;
  const result = await listMyReferrals({});
  const canCreate = actor.facts.memberships.some(
    (m) => m.role === 'ALUMNI' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
  );
  const canReceive = actor.facts.memberships.some(
    (m) => m.role === 'STUDENT' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
  );
  return result.ok ? (
    <ReferralList
      initial={result.data}
      userId={actor.userId}
      canCreate={canCreate}
      canReceive={canReceive}
    />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}
