import { guardPage } from '@/server/permissions/page-guard';
import { ErrorState } from '@/components/ui';
import { AwardAdmin } from '@/components/year-alumni/admin';
import { getDb } from '@/server/db';
import { requirePageAnyAdmin as requireAnyAdmin, managedDepartmentIds } from '@/server/permissions';
export const dynamic = 'force-dynamic';
export default async function YearAlumniAdminPage() {
  const guarded = await guardPage('page.adminYearAlumni', () => requireAnyAdmin());
  if (!guarded.ok) return <ErrorState errorCode={guarded.errorCode} />;
  const actor = guarded.value;
  const ids = await managedDepartmentIds(actor);
  const departments = await getDb().department.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return <AwardAdmin departments={departments} />;
}
