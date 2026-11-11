import { getTranslations } from 'next-intl/server';
import { ErrorState, PageHeader } from '@/components/ui';
import { AdminEvents } from '@/components/campus-events/admin-events';
import { listCampusEventModeration } from '@/server/actions/campus-events';
import { getDb } from '@/server/db';
import { managedDepartmentIds, requireAnyAdmin } from '@/server/permissions';
export const dynamic = 'force-dynamic';
export default async function AdminCampusEventsPage() {
  const actor = await requireAnyAdmin().catch(() => null);
  if (!actor) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const [ids, result, t] = await Promise.all([
    managedDepartmentIds(actor),
    listCampusEventModeration(),
    getTranslations('campusEvents'),
  ]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const departments = await getDb().department.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader title={t('adminTitle')} description={t('adminDescription')} />
      <AdminEvents departments={departments} events={result.data} />
    </main>
  );
}
