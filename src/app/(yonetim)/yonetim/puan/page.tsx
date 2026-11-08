import { adminAccess } from '@/components/admin/access';
import { AdminPoints } from '@/components/points/admin-points';
import { ErrorState } from '@/components/ui';
import {
  decideSuspicion,
  listPointEntries,
  listPointRules,
  listSuspicionFlags,
  requestPointBackfill,
  revokePointEntry,
  updatePointRule,
} from '@/server/actions/points';

export const dynamic = 'force-dynamic';

/** Puan yönetimi yalnız sistem yöneticisine açıktır (`adminGrants` yeteneği yalnız onda var). */
export default async function PointsAdminPage() {
  const access = await adminAccess('adminGrants');
  if (!access.ok) return <ErrorState errorCode={access.errorCode} />;
  const [rules, flags] = await Promise.all([
    listPointRules().catch(() => null),
    listSuspicionFlags({ status: 'OPEN' }).catch(() => null),
  ]);
  if (!rules || !flags) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!rules.ok) return <ErrorState errorCode={rules.errorCode} />;
  if (!flags.ok) return <ErrorState errorCode={flags.errorCode} />;
  return (
    <AdminPoints
      rules={rules.data}
      flags={flags.data}
      actions={{
        updateRule: updatePointRule,
        listEntries: listPointEntries,
        revokeEntry: revokePointEntry,
        listFlags: listSuspicionFlags,
        decide: decideSuspicion,
        backfill: requestPointBackfill,
      }}
    />
  );
}
