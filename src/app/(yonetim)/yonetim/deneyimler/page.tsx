import { hasAdminAccess } from '@/components/layout/admin-access';
import { ModerationQueue } from '@/components/experience/moderation-queue';
import { ErrorState } from '@/components/ui';
import {
  listExperienceReports,
  listModerationQueue,
  resolveExperienceReport,
  reviewExperience,
} from '@/server/actions/experience';

export const dynamic = 'force-dynamic';

export default async function ExperienceModerationPage() {
  if (!(await hasAdminAccess())) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const [experiences, reports] = await Promise.all([
    listModerationQueue({}).catch(() => null),
    listExperienceReports({}).catch(() => null),
  ]);
  if (!experiences || !reports) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!experiences.ok) return <ErrorState errorCode={experiences.errorCode} />;
  if (!reports.ok) return <ErrorState errorCode={reports.errorCode} />;
  return (
    <ModerationQueue
      initialExperiences={experiences.data}
      initialReports={reports.data}
      listExperiences={listModerationQueue}
      review={reviewExperience}
      listReports={listExperienceReports}
      resolve={resolveExperienceReport}
    />
  );
}
