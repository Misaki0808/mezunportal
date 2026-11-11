'use client';
import { safeClientAction } from '@/lib/safe-client-action';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Badge, Button, Checkbox, Field, Input, Select } from '@/components/ui';
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
        className="grid gap-4 rounded-card border border-border bg-bg p-4 shadow-card sm:p-5"
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
            const result = await safeClientAction(() => saveCourse(parsed.data));
            setStatus(result.ok ? t('saved') : errors(result.errorCode));
            if (result.ok) {
              setSelected(null);
              router.refresh();
            }
          });
        }}
      >
        <h2 className="text-xl font-semibold">{t(selected ? 'editCourse' : 'addCourse')}</h2>
        <Field label={t('department')} required>
          {(control) => (
            <Select
              {...control}
              name="departmentId"
              defaultValue={selected?.departmentId ?? departments[0]?.id}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <Field label={t('code')} required>
            {(control) => (
              <Input {...control} maxLength={32} name="code" defaultValue={selected?.code} />
            )}
          </Field>
          <Field label={t('name')} required>
            {(control) => (
              <Input {...control} maxLength={200} name="name" defaultValue={selected?.name} />
            )}
          </Field>
        </div>
        <Field label={t('semester')} required>
          {(control) => (
            <Input
              {...control}
              type="number"
              inputMode="numeric"
              min={0}
              max={8}
              name="semester"
              defaultValue={selected?.semester ?? 1}
            />
          )}
        </Field>
        <Checkbox
          name="elective"
          value="yes"
          label={t('elective')}
          defaultChecked={selected?.elective ?? true}
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={pending}>
            {t(pending ? 'saving' : 'save')}
          </Button>
          {selected && (
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {t('cancel')}
            </Button>
          )}
        </div>
        <p role="status" className="text-fg-muted">
          {status}
        </p>
      </form>
      <div className="space-y-2">
        {courses.map((course) => (
          <button
            type="button"
            key={course.id}
            aria-pressed={selected?.id === course.id}
            onClick={() => {
              setSelected(course);
              setStatus('');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="press-row block min-h-11 w-full rounded-card border border-border bg-bg p-4 text-left aria-pressed:border-primary aria-pressed:bg-primary-soft"
          >
            <span className="font-semibold text-fg">{course.name}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
              <Badge tone="category">{t(course.elective ? 'elective' : 'required')}</Badge>
              {course.code} · {t('semesterNumber', { count: course.semester })}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
