import { adminAccess } from '@/components/admin/access';
import { EmploymentPanel } from '@/components/admin/employment';
import { ErrorState } from '@/components/ui';
import { getEmploymentReport } from '@/server/actions/admin';
export const dynamic = 'force-dynamic';
export default async function EmploymentPage() {
  const access = await adminAccess('employmentReport');
  if (!access.ok) return <ErrorState errorCode={access.errorCode} />;
  const report = await getEmploymentReport({}).catch(() => null);
  if (!report) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!report.ok) return <ErrorState errorCode={report.errorCode} />;
  return (
    <EmploymentPanel
      initial={report.data}
      departments={access.overview.departments}
      load={getEmploymentReport}
    />
  );
}
