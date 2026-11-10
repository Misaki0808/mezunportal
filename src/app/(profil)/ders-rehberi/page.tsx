import { getTranslations } from 'next-intl/server';
import { getCourseGuide } from '@/server/actions/course-guide';
import { ErrorState } from '@/components/ui';

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
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-muted">{t('description')}</p>
      </header>
      <form className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-4">
        <label>
          {t('search')}
          <input
            name="q"
            defaultValue={query.q}
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-transparent px-3"
          />
        </label>
        <label>
          {t('semester')}
          <select
            name="semester"
            defaultValue={semester?.toString() ?? ''}
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3"
          >
            <option value="">{t('all')}</option>
            {Array.from({ length: 9 }, (_, i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('kind')}
          <select
            name="kind"
            defaultValue={query.kind ?? ''}
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3"
          >
            <option value="">{t('all')}</option>
            <option value="elective">{t('elective')}</option>
            <option value="required">{t('required')}</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-lg bg-primary px-4 font-semibold text-on-primary">
          {t('filter')}
        </button>
      </form>
      {result.data.length === 0 && <p>{t('empty')}</p>}
      {groups.map(
        (courses, index) =>
          courses.length > 0 && (
            <section key={index} className="space-y-3">
              <h2 className="text-xl font-bold">
                {t(index === 0 ? 'departmentCourses' : 'commonCourses')}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {courses.map((c) => (
                  <article key={c.id} className="rounded-2xl border border-border p-5">
                    <p className="text-sm text-muted">
                      {c.code} · {t('semesterNumber', { count: c.semester })} ·{' '}
                      {t(c.elective ? 'elective' : 'required')}
                    </p>
                    <h3 className="mt-2 font-semibold">{c.name}</h3>
                    <p className="mt-3 text-sm">
                      {c.count === null ? t('notEnough') : t('alumniCount', { count: c.count })}
                    </p>
                    {c.sectors.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {c.sectors.map((name) => (
                          <li
                            key={name}
                            className="rounded-full bg-primary-soft px-3 py-1 text-sm text-on-primary-soft"
                          >
                            {name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ),
      )}
    </main>
  );
}
