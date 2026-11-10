'use client';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { courseSelectionSchema } from '@/contracts/course-guide';
import { saveAlumniCourses } from '@/server/actions/course-guide';

type Course = { id: string; name: string; code: string; semester: number; elective: boolean };
export function CourseSelector({ courses, initial }: { courses: Course[]; initial: string[] }) {
  const t = useTranslations('courseGuide');
  const errors = useTranslations('errors.codes');
  const [selected, setSelected] = useState(initial);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [pending, startTransition] = useTransition();
  const filtered = courses.filter((c) =>
    `${c.name} ${c.code}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')),
  );
  return (
    <div className="space-y-4">
      <label className="block">
        {t('search')}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-border bg-transparent px-3"
        />
      </label>
      <p>{t('selectedCount', { count: selected.length })}</p>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto">
        {filtered.map((course) => (
          <label
            key={course.id}
            className="flex min-h-11 items-center gap-3 rounded-xl border border-border p-3"
          >
            <input
              type="checkbox"
              checked={selected.includes(course.id)}
              disabled={!selected.includes(course.id) && selected.length >= 5}
              onChange={() => {
                setStatus('');
                setSelected((prev) =>
                  prev.includes(course.id)
                    ? prev.filter((id) => id !== course.id)
                    : [...prev, course.id],
                );
              }}
            />
            <span>
              {course.name}
              <small className="block text-muted">
                {course.code} · {t('semesterNumber', { count: course.semester })}
              </small>
            </span>
          </label>
        ))}
      </div>
      {filtered.length === 0 && <p>{t('empty')}</p>}
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const parsed = courseSelectionSchema.safeParse({ courseIds: selected });
            if (!parsed.success) {
              setStatus(errors('VALIDATION_INVALID'));
              return;
            }
            const result = await saveAlumniCourses(parsed.data);
            setStatus(result.ok ? t('saved') : errors(result.errorCode));
          })
        }
        className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white disabled:opacity-50"
      >
        {t(pending ? 'saving' : 'save')}
      </button>
      <p role="status">{status}</p>
    </div>
  );
}
