import { guardPage } from '@/server/permissions/page-guard';
import { ReferralList } from '@/components/referrals/referral-ui';
import { ErrorState } from '@/components/ui';
import { listReferralModeration } from '@/server/actions/referrals';
import { requirePageAnyAdmin as requireAnyAdmin } from '@/server/permissions';
export const dynamic = 'force-dynamic';
export default async function ReferralModerationPage() {
  const guarded = await guardPage('page.adminReferrals', () => requireAnyAdmin());
  if (!guarded.ok) return <ErrorState errorCode={guarded.errorCode} />;
  const actor = guarded.value;
  const result = await listReferralModeration({});
  return result.ok ? (
    <ReferralList initial={result.data} userId={actor.userId} moderation />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}
