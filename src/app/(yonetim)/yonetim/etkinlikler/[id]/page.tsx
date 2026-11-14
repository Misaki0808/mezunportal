import { guardPage } from '@/server/permissions/page-guard';
import { getTranslations } from 'next-intl/server';
import { ErrorState, PageHeader } from '@/components/ui';
import { EventCode } from '@/components/campus-events/event-code';
import { requirePageAnyAdmin as requireAnyAdmin } from '@/server/permissions';
export const dynamic = 'force-dynamic';
export default async function CampusEventCodePage({ params }: { params: Promise<{ id: string }> }) {
  const guarded = await guardPage('page.adminEventCode', () => requireAnyAdmin(), 'AUTH_FORBIDDEN');
  if (!guarded.ok) return <ErrorState errorCode={guarded.errorCode} />;
  const [{ id }, t] = await Promise.all([params, getTranslations('campusEvents')]);
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader title={t('present')} description={t('presentDescription')} />
      <EventCode eventId={id} />
    </div>
  );
}
