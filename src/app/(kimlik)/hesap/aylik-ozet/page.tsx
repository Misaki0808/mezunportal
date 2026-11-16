import { guardPage } from '@/server/permissions/page-guard';
import { getTranslations } from 'next-intl/server';
import { DigestView } from '@/components/notifications/digest-view';
import { AccountFrame } from '@/components/account/account-frame';
import { ErrorState } from '@/components/ui';
import { getDb } from '@/server/db';
import { requirePageVerifiedMember as requireVerifiedMember } from '@/server/permissions';
import { buildMonthlyDigest } from '@/server/services/monthly-digest';

export const dynamic = 'force-dynamic';
export default async function MonthlyDigestPage() {
  const guarded = await guardPage('page.monthlyDigest', () => requireVerifiedMember());
  if (!guarded.ok) return <ErrorState errorCode={guarded.errorCode} />;
  const actor = guarded.value;
  const t = await getTranslations('monthlyDigest');
  const digest = await buildMonthlyDigest(getDb(), actor.userId);
  return (
    <AccountFrame title={t('pageTitle')} description={t('pageDescription')} width="max-w-2xl">
      <DigestView digest={digest} />
    </AccountFrame>
  );
}
