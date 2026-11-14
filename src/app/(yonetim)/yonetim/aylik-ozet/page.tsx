import { guardPage } from '@/server/permissions/page-guard';
import { getTranslations } from 'next-intl/server';
import { hasAdminAccessStrict } from '@/components/layout/admin-access';
import { DigestView } from '@/components/notifications/digest-view';
import { ErrorState, PageHeader } from '@/components/ui';
import { getDb } from '@/server/db';
import { requirePageVerifiedMember as requireVerifiedMember } from '@/server/permissions';
import { buildMonthlyDigest } from '@/server/services/monthly-digest';

export const dynamic = 'force-dynamic';
export default async function MonthlyDigestPreview() {
  const admin = await guardPage('page.adminDigestAccess', hasAdminAccessStrict);
  if (!admin.ok) return <ErrorState errorCode={admin.errorCode} />;
  if (!admin.value) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const guarded = await guardPage('page.adminDigest', () => requireVerifiedMember());
  if (!guarded.ok) return <ErrorState errorCode={guarded.errorCode} />;
  const actor = guarded.value;
  const t = await getTranslations('monthlyDigest');
  const digest = await buildMonthlyDigest(getDb(), actor.userId);
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <PageHeader title={t('adminPreview')} description={t('adminDescription')} />
      <DigestView digest={digest} />
    </div>
  );
}
