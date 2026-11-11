import { getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/ui';
import { CourseSelector } from '@/components/course-guide/course-selector';
import { getAlumniCourses } from '@/server/actions/course-guide';
export const dynamic = 'force-dynamic';
export default async function AlumniCoursesPage() {
  const [result, t] = await Promise.all([getAlumniCourses(), getTranslations('courseGuide')]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <h1 className="text-3xl font-bold">{t('alumniTitle')}</h1>
      <p>{t('alumniDescription')}</p>
      <CourseSelector courses={result.data.courses} initial={result.data.selected} />
    </div>
  );
}
