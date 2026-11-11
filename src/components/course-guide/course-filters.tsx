'use client';
import { useTranslations } from 'next-intl';
import { Button, Field, Input, Select } from '@/components/ui';

/** Ders rehberi süzgeci: GET formu (adres çubuğunda paylaşılabilir). Mobilde yarıyıl ve tür yan yana iner. */
export function CourseFilters({
  query,
  semester,
  kind,
}: {
  query?: string;
  semester?: number;
  kind?: string;
}) {
  const t = useTranslations('courseGuide');
  return (
    <form
      role="search"
      aria-label={t('filters')}
      className="grid gap-3 rounded-card border border-border bg-bg p-4 shadow-card sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
    >
      <Field label={t('search')}>
        {(control) => <Input {...control} name="q" defaultValue={query} />}
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:contents">
        <Field label={t('semester')}>
          {(control) => (
            <Select {...control} name="semester" defaultValue={semester?.toString() ?? ''}>
              <option value="">{t('all')}</option>
              {Array.from({ length: 9 }, (_, i) => (
                <option key={i} value={i}>
                  {t('semesterNumber', { count: i })}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('kind')}>
          {(control) => (
            <Select {...control} name="kind" defaultValue={kind ?? ''}>
              <option value="">{t('all')}</option>
              <option value="elective">{t('elective')}</option>
              <option value="required">{t('required')}</option>
            </Select>
          )}
        </Field>
      </div>
      <Button type="submit" fullWidth>
        {t('filter')}
      </Button>
    </form>
  );
}
