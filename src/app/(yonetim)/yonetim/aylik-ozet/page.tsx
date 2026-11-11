import { getTranslations } from 'next-intl/server';
import { hasAdminAccess } from '@/components/layout/admin-access';
import { DigestView } from '@/components/notifications/digest-view';
import { ErrorState, PageHeader } from '@/components/ui';
import { getDb } from '@/server/db';
import { requireVerifiedMember } from '@/server/permissions';
import { buildMonthlyDigest } from '@/server/services/monthly-digest';

export const dynamic = 'force-dynamic';
export default async function MonthlyDigestPreview() {
  if (!(await hasAdminAccess())) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const actor = await requireVerifiedMember().catch(() => null);
  if (!actor) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const t = await getTranslations('monthlyDigest');
  const digest = await buildMonthlyDigest(getDb(), actor.userId);
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <PageHeader title={t('adminPreview')} description={t('adminDescription')} />
      <DigestView digest={digest} />
    </div>
  );
}
