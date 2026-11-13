import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  Badge,
  buttonClasses,
  Card,
  EmptyState,
  ErrorState,
  FileTextIcon,
  PageHeader,
} from '@/components/ui';
import { CourseFilters } from '@/components/course-guide/course-filters';
import { groupGuideCourses } from '@/components/course-guide/group-courses';
import { getCourseGuide } from '@/server/actions/course-guide';

export const dynamic = 'force-dynamic';
export default async function CourseGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string; kind?: string; q?: string }>;
}) {
  const query = await searchParams;
  const semester =
    query.semester && /^[0-8]$/.test(query.semester) ? Number(query.semester) : undefined;
  const elective = query.kind === 'elective' ? true : query.kind === 'required' ? false : undefined;
  const result = await getCourseGuide({ semester, elective, query: query.q?.slice(0, 100) });
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const t = await getTranslations('courseGuide');
  const groups = groupGuideCourses(result.data);
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <PageHeader title={t('title')} description={t('description')} />
      <CourseFilters query={query.q} semester={semester} kind={query.kind} />
      {result.data.length === 0 && (
        <EmptyState
          className="rounded-card border border-dashed border-border"
          icon={<FileTextIcon width={32} height={32} strokeWidth={1.5} />}
          title={t('emptyTitle')}
          description={t('empty')}
          action={
            <Link href="/ders-rehberi" className={buttonClasses({ variant: 'secondary' })}>
              {t('clearFilters')}
            </Link>
          }
        />
      )}
      {groups.map(
        ({ category, reviewed, semesters }) =>
          (reviewed.length > 0 || semesters.length > 0) && (
            <section key={category} className="space-y-3">
              <h2 className="text-xl font-semibold text-fg">
                {t(category === 'department' ? 'departmentCourses' : 'commonCourses')}
              </h2>
              {reviewed.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2">
                  {reviewed.map((c) => (
                    <Card as="article" key={c.id} data-course-code={c.code}>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                        <Badge tone="category">{t(c.elective ? 'elective' : 'required')}</Badge>
                        <span>
                          {c.code} · {t('semesterNumber', { count: c.semester })}
                        </span>
                      </div>
                      <h3 className="mt-2 break-words font-semibold text-fg">{c.name}</h3>
                      <div className="mt-3">
                        <Badge tone="success">{t('alumniBadge', { count: c.count! })}</Badge>
                      </div>
                      {c.sectors.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-2">
                          {c.sectors.map((name) => (
                            <li key={name}>
                              <Badge tone="info">{name}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  ))}
                </div>
              )}
              <div className="grid gap-1 md:grid-cols-2 md:items-start">
                {semesters.map(({ semester, courses }) => (
                  <div
                    key={semester}
                    className="rounded-card border border-border bg-surface px-2.5 py-0.5"
                  >
                    <h3 className="text-sm font-semibold text-fg-muted">
                      {t('semesterNumber', { count: semester })} · {t('notEnoughShort')}
                    </h3>
                    <ul className="mt-1">
                      {courses.map((course) => (
                        <li
                          key={course.id}
                          data-course-code={course.code}
                          className="flex items-baseline gap-1 text-sm leading-[1.125rem]"
                        >
                          <span className="shrink-0 text-xs text-fg-muted">{course.code}</span>
                          <span className="min-w-0 flex-1 break-words text-fg">{course.name}</span>
                          <Badge tone="category" className="shrink-0 px-1 py-0 text-xs">
                            {t(course.elective ? 'elective' : 'required')}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ),
      )}
    </div>
  );
}
