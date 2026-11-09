import { ErrorState } from '@/components/ui';
import { AwardAdmin } from '@/components/year-alumni/admin';
import { getDb } from '@/server/db';
import { requireAnyAdmin, managedDepartmentIds } from '@/server/permissions';
export const dynamic = 'force-dynamic';
export default async function YearAlumniAdminPage() {
  const actor = await requireAnyAdmin().catch(() => null);
  if (!actor) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const ids = await managedDepartmentIds(actor);
  const departments = await getDb().department.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return <AwardAdmin departments={departments} />;
}
