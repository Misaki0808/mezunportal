import { hasAdminAccess } from '@/components/layout/admin-access';
import { AdminUsers } from '@/components/admin/users';
import { ErrorState } from '@/components/ui';
import { searchUsers } from '@/server/actions/admin-users';
export const dynamic = 'force-dynamic';
export default async function UsersPage() {
  if (!(await hasAdminAccess())) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const result = await searchUsers({}).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return <AdminUsers initial={result.data} search={searchUsers} />;
}
