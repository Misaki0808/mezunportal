import { adminAccess } from '@/components/admin/access';
import { AuditLog } from '@/components/admin/audit-log';
import { ErrorState } from '@/components/ui';
import { listAuditLog } from '@/server/actions/admin';
export const dynamic = 'force-dynamic';
export default async function AuditPage() {
  const access = await adminAccess('auditLog');
  if (!access.ok) return <ErrorState errorCode={access.errorCode} />;
  const result = await listAuditLog({}).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return <AuditLog initial={result.data} list={listAuditLog} />;
}
