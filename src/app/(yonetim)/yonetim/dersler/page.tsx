import { AdminFrame } from '@/components/admin/frame';
import { getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/ui';
import { CourseAdmin } from '@/components/course-guide/course-admin';
import { getManagedCourses } from '@/server/actions/course-guide';
export const dynamic = 'force-dynamic';
export default async function ManageCoursesPage() {
  const [result, t] = await Promise.all([getManagedCourses(), getTranslations('courseGuide')]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <AdminFrame title={t('adminTitle')} description={t('adminDescription')}>
      <CourseAdmin departments={result.data.departments} courses={result.data.courses} />
    </AdminFrame>
  );
}
