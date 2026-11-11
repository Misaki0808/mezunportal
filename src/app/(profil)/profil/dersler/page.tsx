import { getTranslations } from 'next-intl/server';
import { ErrorState, PageHeader } from '@/components/ui';
import { CourseSelector } from '@/components/course-guide/course-selector';
import { getAlumniCourses } from '@/server/actions/course-guide';
export const dynamic = 'force-dynamic';
export default async function AlumniCoursesPage() {
  const [result, t] = await Promise.all([getAlumniCourses(), getTranslations('courseGuide')]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <PageHeader title={t('alumniTitle')} description={t('alumniDescription')} />
      <CourseSelector courses={result.data.courses} initial={result.data.selected} />
    </div>
  );
}
