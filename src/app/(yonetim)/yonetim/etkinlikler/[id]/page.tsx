import { AdminFrame } from '@/components/admin/frame';
import { guardPage } from '@/server/permissions/page-guard';
import { getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/ui';
import { EventCode } from '@/components/campus-events/event-code';
import { requirePageAnyAdmin as requireAnyAdmin } from '@/server/permissions';
export const dynamic = 'force-dynamic';
export default async function CampusEventCodePage({ params }: { params: Promise<{ id: string }> }) {
  const guarded = await guardPage('page.adminEventCode', () => requireAnyAdmin());
  if (!guarded.ok) return <ErrorState errorCode={guarded.errorCode} />;
  const [{ id }, t] = await Promise.all([params, getTranslations('campusEvents')]);
  return (
    <AdminFrame title={t('present')} description={t('presentDescription')}>
      <EventCode eventId={id} />
    </AdminFrame>
  );
}
