import { adminAccess } from '@/components/admin/access';
import { AdminReports } from '@/components/admin/reports';
import { ErrorState } from '@/components/ui';
import { listAdminReports } from '@/server/actions/admin';
import { resolveExperienceReport } from '@/server/actions/experience';
import { listJobPostingReports } from '@/server/actions/job-postings';
export const dynamic = 'force-dynamic';
export default async function ReportsPage() {
  const access = await adminAccess('reports');
  if (!access.ok) return <ErrorState errorCode={access.errorCode} />;
  const result = await listAdminReports({}).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const jobs = await listJobPostingReports({}).catch(() => null);
  if (!jobs) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!jobs.ok) return <ErrorState errorCode={jobs.errorCode} />;
  return (
    <AdminReports
      initial={result.data}
      jobReports={jobs.data}
      list={listAdminReports}
      resolve={resolveExperienceReport}
    />
  );
}
