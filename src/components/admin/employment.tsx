'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  EMPLOYMENT_DIMENSIONS,
  employmentExportHref,
  employmentReportFilterSchema,
  type AdminOverview,
  type EmploymentReport,
  type EmploymentReportFilter,
} from '@/contracts/admin';
import type { ActionResult } from '@/contracts/result';
import { Button, EmptyState, Field, Input, Select, buttonClasses } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';
import { AdminFrame } from './frame';
import { ResponsiveRows } from './responsive-rows';

type Props = {
  initial: EmploymentReport;
  departments: AdminOverview['departments'];
  load: (input: EmploymentReportFilter) => Promise<ActionResult<EmploymentReport>>;
};
export function EmploymentPanel({ initial, departments, load }: Props) {
  const t = useTranslations('admin');
  const errors = useTranslations('errors.codes');
  const [report, setReport] = useState(initial);
  const [department, setDepartment] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<EmploymentReportFilter>({});
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  async function apply() {
    if (pending) return;
    const parsed = employmentReportFilterSchema.safeParse({
      ...(department ? { departmentId: department } : {}),
      ...(from ? { graduationYearFrom: Number(from) } : {}),
      ...(to ? { graduationYearTo: Number(to) } : {}),
    });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setPending(true);
    setError(undefined);
    try {
      const result = await load(parsed.data);
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setReport(result.data);
      setApplied(parsed.data);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }
  return (
    <AdminFrame title={t('employment.title')} description={t('employment.description')}>
      <form
        className="grid gap-4 rounded-card border border-border p-5 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void apply();
        }}
      >
        <Field label={t('department')}>
          {(props) => (
            <Select {...props} value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">{t('all')}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.facultyName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('employment.yearFrom')}>
          {(props) => (
            <Input
              {...props}
              type="number"
              inputMode="numeric"
              min={1950}
              max={2100}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('employment.yearTo')}>
          {(props) => (
            <Input
              {...props}
              type="number"
              inputMode="numeric"
              min={1950}
              max={2100}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          )}
        </Field>
        {invalid && (
          <p role="alert" className="text-danger sm:col-span-3">
            {t('invalid')}
          </p>
        )}
        <div className="sm:col-span-3">
          <Button type="submit" loading={pending}>
            {t('employment.filter')}
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-4 text-danger">
          {errors(error)}
        </p>
      )}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold">
            {t('employment.total', { count: report.totalAlumni })}
          </p>
          <p className="text-fg-muted">
            {t('employment.withPosition', { count: report.alumniWithPosition })}
          </p>
        </div>
        <a href={employmentExportHref(applied)} className={buttonClasses({ variant: 'secondary' })}>
          {t('employment.download')}
        </a>
      </div>
      {EMPLOYMENT_DIMENSIONS.map((dimension) => (
        <section key={dimension} className="mt-8">
          <h2 className="mb-4 text-xl font-semibold">{t(`employment.${dimension}`)}</h2>
          {report.distributions[dimension].length === 0 ? (
            <EmptyState title={t('employment.groupEmpty')} />
          ) : (
            <ResponsiveRows
              headers={[t('name'), t('employment.count')]}
              rows={report.distributions[dimension].map((bucket) => ({
                id: `${bucket.type}-${bucket.label ?? ''}`,
                cells: [
                  bucket.label ?? t(`employment.${bucket.type === 'OTHER' ? 'other' : 'unknown'}`),
                  String(bucket.count),
                ],
              }))}
            />
          )}
        </section>
      ))}
    </AdminFrame>
  );
}
