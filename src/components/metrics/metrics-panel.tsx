'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Badge, Button, EmptyState, Field, Input, Select } from '@/components/ui';
import {
  EVENT_TYPES,
  usageExportHref,
  usageMetricsFilterSchema,
  type EventType,
  type UsageMetrics,
  type UsageMetricsFilter,
} from '@/contracts/metrics';
import type { AdminOverview } from '@/contracts/admin';
import type { ErrorCode } from '@/lib/errors';
import { getUsageMetrics } from '@/server/actions/metrics';

const DAY = 86_400_000;
const dateString = (value: Date) => new Date(value).toISOString().slice(0, 10);
type Props = {
  initial: UsageMetrics;
  initialFilter: { from: Date; to: Date };
  departments: AdminOverview['departments'];
};
export function MetricsPanel({ initial, initialFilter, departments }: Props) {
  const t = useTranslations('admin.metrics');
  const errors = useTranslations('errors.codes');
  const [report, setReport] = useState(initial);
  const [applied, setApplied] = useState<UsageMetricsFilter>(initialFilter);
  const [from, setFrom] = useState(dateString(new Date(initialFilter.from)));
  const [to, setTo] = useState(dateString(new Date(new Date(initialFilter.to).getTime() - DAY)));
  const [department, setDepartment] = useState('');
  const [type, setType] = useState<EventType | ''>('');
  const [pending, setPending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [downloadError, setDownloadError] = useState(false);
  const loadLock = useRef(false);
  const exportLock = useRef(false);
  async function apply() {
    if (loadLock.current) return;
    const end = new Date(`${to}T00:00:00.000Z`);
    const parsed = usageMetricsFilterSchema.safeParse({
      from: new Date(`${from}T00:00:00.000Z`),
      to: new Date(end.getTime() + DAY),
      ...(department ? { departmentId: department } : {}),
      ...(type ? { types: [type] } : {}),
    });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setError(undefined);
    setPending(true);
    loadLock.current = true;
    try {
      const result = await getUsageMetrics(parsed.data);
      if (!result.ok) setError(result.errorCode);
      else {
        setReport(result.data);
        setApplied(parsed.data);
      }
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
      loadLock.current = false;
    }
  }
  async function download() {
    if (exportLock.current || rateLimited) return;
    exportLock.current = true;
    setExporting(true);
    setDownloadError(false);
    try {
      const response = await fetch(usageExportHref(applied), { cache: 'no-store' });
      if (response.status === 429) {
        setRateLimited(true);
        window.setTimeout(() => setRateLimited(false), 3600000);
        return;
      }
      if (!response.ok) {
        setDownloadError(true);
        return;
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'kullanim-metrikleri.xlsx';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setDownloadError(true);
    } finally {
      setExporting(false);
      exportLock.current = false;
    }
  }
  const isEmpty = report.totalsByType.every((item) => item.events === 0);
  const hiddenTypes = report.totalsByType.filter((item) => item.events === null);
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 pb-28">
      <Link href="/yonetim" className="inline-flex min-h-11 items-center text-primary">
        ← {t('back')}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">{t('title')}</h1>
      <p className="mt-3 text-base text-fg-muted">{t('description')}</p>
      <form
        className="mt-7 grid gap-4 rounded-card border border-border p-5 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void apply();
        }}
      >
        <Field label={t('from')}>
          {(control) => (
            <Input
              {...control}
              type="date"
              required
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('to')}>
          {(control) => (
            <Input
              {...control}
              type="date"
              required
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('department')}>
          {(control) => (
            <Select
              {...control}
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            >
              <option value="">{t('all')}</option>
              {departments.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name} · {item.facultyName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('eventType')}>
          {(control) => (
            <Select
              {...control}
              value={type}
              onChange={(event) => setType(event.target.value as EventType | '')}
            >
              <option value="">{t('allTypes')}</option>
              {EVENT_TYPES.map((item) => (
                <option value={item} key={item}>
                  {t(`types.${item}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {invalid && (
          <p role="alert" className="text-danger sm:col-span-2">
            {t('invalid')}
          </p>
        )}
        {error && (
          <p role="alert" className="text-danger sm:col-span-2">
            {errors(error)}
          </p>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" loading={pending}>
            {pending ? t('loading') : t('apply')}
          </Button>
        </div>
      </form>
      {isEmpty ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Button
              variant="secondary"
              onClick={() => document.querySelector<HTMLInputElement>('input[type=date]')?.focus()}
            >
              {t('emptyAction')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-base text-fg-muted">{t('active')}</p>
              <p className="mt-2 text-xl font-semibold">
                {report.activeUsers === null ? (
                  <Badge tone="neutral" className="text-base">
                    {t('hidden')}
                  </Badge>
                ) : (
                  report.activeUsers
                )}
              </p>
            </div>
            {rateLimited ? (
              <Button variant="secondary" disabled disabledReason={t('rateLimit')}>
                {t('download')}
              </Button>
            ) : (
              <Button variant="secondary" loading={exporting} onClick={() => void download()}>
                {exporting ? t('downloading') : t('download')}
              </Button>
            )}
          </div>
          {downloadError && (
            <p role="alert" className="mt-3 text-danger">
              {t('downloadError')}
            </p>
          )}
          <p className="mt-6 text-base text-fg-muted">{t('privacy')}</p>
          <section className="mt-8">
            <h2 className="text-xl font-semibold">{t('totals')}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {report.totalsByType.map((item) => (
                <li
                  key={item.type}
                  className="flex min-h-16 items-center justify-between gap-3 rounded-card border border-border p-4"
                >
                  <span>{t(`types.${item.type}`)}</span>
                  {item.events === null ? (
                    <Badge tone="neutral" className="text-base">
                      {t('hidden')}
                    </Badge>
                  ) : (
                    <span className="font-semibold">{item.events}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-8">
            <h2 className="text-xl font-semibold">{t('breakdown')}</h2>
            <div className="mt-4 space-y-3 lg:hidden">
              {report.cells.map((cell, i) => (
                <article
                  key={`${cell.type}-${cell.departmentId}-${cell.role}-${i}`}
                  className="rounded-card border border-border p-4"
                >
                  <h3 className="font-semibold">{t(`types.${cell.type}`)}</h3>
                  <p className="mt-2 break-words text-base text-fg-muted [overflow-wrap:anywhere]">
                    {cell.kind === 'OTHER'
                      ? t('other')
                      : `${cell.role ? t(`roles.${cell.role}`) : t('noRole')} · ${cell.departmentName ?? t('noDepartment')}`}
                  </p>
                  <p className="mt-3">
                    {t('events')}: {cell.events}
                  </p>
                  <p>
                    {t('users')}: {cell.users}
                  </p>
                </article>
              ))}
              {hiddenTypes.map((item) => (
                <article
                  key={`hidden-${item.type}`}
                  className="rounded-card border border-border p-4"
                >
                  <h3 className="font-semibold">{t(`types.${item.type}`)}</h3>
                  <p className="mt-3">
                    <Badge tone="neutral" className="text-base">
                      {t('hidden')}
                    </Badge>
                  </p>
                </article>
              ))}
            </div>
            <div className="mt-4 hidden overflow-x-auto lg:block">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    {['event', 'role', 'departmentColumn', 'events', 'users'].map((key) => (
                      <th className="border-b border-border px-3 py-3" key={key}>
                        {t(key as 'event')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.cells.map((cell, i) => (
                    <tr key={`${cell.type}-${cell.departmentId}-${cell.role}-${i}`}>
                      <td className="border-b border-border px-3 py-3">
                        {t(`types.${cell.type}`)}
                      </td>
                      <td className="border-b border-border px-3 py-3">
                        {cell.kind === 'OTHER'
                          ? t('other')
                          : cell.role
                            ? t(`roles.${cell.role}`)
                            : t('noRole')}
                      </td>
                      <td className="border-b border-border px-3 py-3">
                        {cell.kind === 'OTHER' ? '—' : (cell.departmentName ?? t('noDepartment'))}
                      </td>
                      <td className="border-b border-border px-3 py-3">{cell.events}</td>
                      <td className="border-b border-border px-3 py-3">{cell.users}</td>
                    </tr>
                  ))}
                  {hiddenTypes.map((item) => (
                    <tr key={`hidden-${item.type}`}>
                      <td className="border-b border-border px-3 py-3">
                        {t(`types.${item.type}`)}
                      </td>
                      <td colSpan={4} className="border-b border-border px-3 py-3">
                        <Badge tone="neutral" className="text-base">
                          {t('hidden')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
