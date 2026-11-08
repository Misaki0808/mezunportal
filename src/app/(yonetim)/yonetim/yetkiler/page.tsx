import { adminAccess } from '@/components/admin/access';
import { AdminGrants } from '@/components/admin/grants';
import { ErrorState } from '@/components/ui';
import {
  grantAdmin,
  listAdminGrants,
  revokeAdmin,
  searchUsers,
} from '@/server/actions/admin-users';
export const dynamic = 'force-dynamic';
export default async function GrantsPage() {
  const access = await adminAccess('adminGrants');
  if (!access.ok) return <ErrorState errorCode={access.errorCode} />;
  const result = await listAdminGrants({}).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <AdminGrants
      initial={result.data}
      departments={access.overview.departments}
      list={listAdminGrants}
      search={searchUsers}
      grant={grantAdmin}
      revoke={revokeAdmin}
    />
  );
}
