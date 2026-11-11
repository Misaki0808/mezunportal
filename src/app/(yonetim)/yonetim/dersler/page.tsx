import { getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/ui';
import { CourseAdmin } from '@/components/course-guide/course-admin';
import { getManagedCourses } from '@/server/actions/course-guide';
export const dynamic = 'force-dynamic';
export default async function ManageCoursesPage() {
  const [result, t] = await Promise.all([getManagedCourses(), getTranslations('courseGuide')]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <h1 className="text-3xl font-bold">{t('adminTitle')}</h1>
      <p>{t('adminDescription')}</p>
      <CourseAdmin departments={result.data.departments} courses={result.data.courses} />
    </div>
  );
}
