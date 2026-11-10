'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { saveCourseSchema } from '@/contracts/course-guide';
import { saveCourse } from '@/server/actions/course-guide';

type Course = {
  id: string;
  departmentId: string;
  code: string;
  name: string;
  semester: number;
  elective: boolean;
};
export function CourseAdmin({
  departments,
  courses,
}: {
  departments: { id: string; name: string }[];
  courses: Course[];
}) {
  const t = useTranslations('courseGuide');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const [selected, setSelected] = useState<Course | null>(null);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState('');
  return (
    <div className="space-y-5">
      <form
        key={selected?.id ?? 'new'}
        className="grid gap-3 rounded-2xl border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(async () => {
            const parsed = saveCourseSchema.safeParse({
              id: selected?.id,
              departmentId: String(data.get('departmentId')),
              code: String(data.get('code')),
              name: String(data.get('name')),
              semester: Number(data.get('semester')),
              elective: data.get('elective') === 'yes',
            });
            if (!parsed.success) {
              setStatus(errors('VALIDATION_INVALID'));
              return;
            }
            const result = await saveCourse(parsed.data);
            setStatus(result.ok ? t('saved') : errors(result.errorCode));
            if (result.ok) {
              setSelected(null);
              router.refresh();
            }
          });
        }}
      >
        <h2 className="text-xl font-semibold">{t(selected ? 'editCourse' : 'addCourse')}</h2>
        <label>
          {t('department')}
          <select
            required
            name="departmentId"
            defaultValue={selected?.departmentId ?? departments[0]?.id}
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('code')}
          <input
            required
            maxLength={32}
            name="code"
            defaultValue={selected?.code}
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-transparent px-3"
          />
        </label>
        <label>
          {t('name')}
          <input
            required
            maxLength={200}
            name="name"
            defaultValue={selected?.name}
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-transparent px-3"
          />
        </label>
        <label>
          {t('semester')}
          <input
            required
            type="number"
            min={0}
            max={8}
            name="semester"
            defaultValue={selected?.semester ?? 1}
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-transparent px-3"
          />
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            name="elective"
            value="yes"
            defaultChecked={selected?.elective ?? true}
          />
          {t('elective')}
        </label>
        <div className="flex gap-2">
          <button
            disabled={pending || !departments.length}
            className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-on-primary disabled:opacity-50"
          >
            {t(pending ? 'saving' : 'save')}
          </button>
          {selected && (
            <button type="button" className="min-h-11 px-4" onClick={() => setSelected(null)}>
              {t('cancel')}
            </button>
          )}
        </div>
        <p role="status">{status}</p>
      </form>
      <div className="space-y-2">
        {courses.map((course) => (
          <button
            type="button"
            key={course.id}
            onClick={() => {
              setSelected(course);
              setStatus('');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="block min-h-11 w-full rounded-xl border border-border p-4 text-left"
          >
            <span className="font-semibold">{course.name}</span>
            <span className="block text-sm text-muted">
              {course.code} · {t('semesterNumber', { count: course.semester })}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
