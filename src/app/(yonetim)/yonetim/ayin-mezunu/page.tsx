import { ErrorState } from '@/components/ui';
import { StoryAdmin } from '@/components/alumni-story/admin';
import { getDb } from '@/server/db';
import { requireAnyAdmin, managedDepartmentIds } from '@/server/permissions';
export const dynamic = 'force-dynamic';
export default async function StoryAdminPage() {
  const actor = await requireAnyAdmin().catch(() => null);
  if (!actor) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const ids = await managedDepartmentIds(actor);
  const departments = await getDb().department.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return <StoryAdmin departments={departments} />;
}
