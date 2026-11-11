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
  const groups = [
    result.data.filter((c) => c.code.startsWith('YBSB')),
    result.data.filter((c) => !c.code.startsWith('YBSB')),
  ];
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
        (courses, index) =>
          courses.length > 0 && (
            <section key={index} className="space-y-3">
              <h2 className="text-xl font-semibold text-fg">
                {t(index === 0 ? 'departmentCourses' : 'commonCourses')}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {courses.map((c) => (
                  <Card as="article" key={c.id}>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                      <Badge tone="category">{t(c.elective ? 'elective' : 'required')}</Badge>
                      <span>
                        {c.code} · {t('semesterNumber', { count: c.semester })}
                      </span>
                    </div>
                    <h3 className="mt-2 break-words font-semibold text-fg">{c.name}</h3>
                    <div className="mt-3">
                      {c.count === null ? (
                        <span className="text-sm text-fg-muted">{t('notEnoughShort')}</span>
                      ) : (
                        <Badge tone="success">{t('alumniBadge', { count: c.count })}</Badge>
                      )}
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
            </section>
          ),
      )}
    </div>
  );
}
