import { hasAdminAccess } from '@/components/layout/admin-access';
import { AdminUserDetail } from '@/components/admin/user-detail';
import { ErrorState } from '@/components/ui';
import { getAdminOverview } from '@/server/actions/admin';
import {
  correctMembership,
  getUserDetail,
  suspendUser,
  unsuspendUser,
} from '@/server/actions/admin-users';
export const dynamic = 'force-dynamic';
export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAdminAccess())) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const { id } = await params;
  const [detail, overview] = await Promise.all([
    getUserDetail({ userId: id }).catch(() => null),
    getAdminOverview().catch(() => null),
  ]);
  if (!detail || !overview) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!detail.ok) return <ErrorState errorCode={detail.errorCode} />;
  if (!overview.ok) return <ErrorState errorCode={overview.errorCode} />;
  return (
    <AdminUserDetail
      initial={detail.data}
      departments={overview.data.departments}
      suspend={suspendUser}
      unsuspend={unsuspendUser}
      correct={correctMembership}
    />
  );
}
