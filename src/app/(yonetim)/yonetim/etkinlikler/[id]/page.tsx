import { getTranslations } from 'next-intl/server';
import { ErrorState, PageHeader } from '@/components/ui';
import { EventCode } from '@/components/campus-events/event-code';
import { requireAnyAdmin } from '@/server/permissions';
export const dynamic = 'force-dynamic';
export default async function CampusEventCodePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAnyAdmin().catch(() => null);
  if (!actor) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const [{ id }, t] = await Promise.all([params, getTranslations('campusEvents')]);
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader title={t('present')} description={t('presentDescription')} />
      <EventCode eventId={id} />
    </main>
  );
}
