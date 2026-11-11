'use client';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Badge, Button, Checkbox, EmptyState, Field, FileTextIcon, Input } from '@/components/ui';
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
      <Field label={t('search')}>
        {(control) => (
          <Input {...control} value={query} onChange={(event) => setQuery(event.target.value)} />
        )}
      </Field>
      <Badge tone={selected.length >= 5 ? 'success' : 'info'}>
        {t('selectedCount', { count: selected.length })}
      </Badge>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto">
        {filtered.map((course) => (
          <div
            key={course.id}
            className="rounded-control border border-border bg-bg px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
          >
            <Checkbox
              label={course.name}
              description={`${course.code} · ${t('semesterNumber', { count: course.semester })}`}
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
          </div>
        ))}
      </div>
      {filtered.length === 0 && (
        <EmptyState
          className="rounded-card border border-dashed border-border"
          icon={<FileTextIcon width={32} height={32} strokeWidth={1.5} />}
          title={t('emptyTitle')}
          description={t('empty')}
        />
      )}
      <Button
        loading={pending}
        fullWidth
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
      >
        {t(pending ? 'saving' : 'save')}
      </Button>
      <p role="status" className="text-fg-muted">
        {status}
      </p>
    </div>
  );
}
