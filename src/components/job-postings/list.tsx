'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type {
  JobPostingCard,
  JobPostingPage,
  SearchJobPostingsInput,
  JobPostingFilterOptions,
} from '@/contracts/job-postings';
import {
  Button,
  Card,
  EmptyState,
  Input,
  Pagination,
  Select,
  buttonClasses,
} from '@/components/ui';

export function PostingCard({ posting }: { posting: JobPostingCard }) {
  const t = useTranslations('jobs');
  const initials = posting.organizationName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toLocaleUpperCase('tr-TR');
  return (
    <Card
      as="article"
      padding="none"
      className="group flex min-w-0 flex-col gap-5 rounded-3xl border border-border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none sm:p-6"
    >
      <div className="flex min-w-0 items-start gap-4">
        <div
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-lg font-bold text-on-primary-soft"
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-fg-muted">
            {posting.organizationName}
          </p>
          <h2 className="mt-1 break-words text-xl font-bold leading-tight text-fg">
            <Link
              className="rounded-sm focus-visible:outline-2 focus-visible:outline-primary"
              href={`/ilanlar/${encodeURIComponent(posting.id)}`}
            >
              {posting.title}
            </Link>
          </h2>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-surface-strong px-3 py-1.5 text-fg">
          {posting.location ?? (posting.isRemote ? t('remoteLabel') : t('unknownLocation'))}
        </span>
        {posting.location && posting.isRemote && (
          <span className="rounded-full bg-surface-strong px-3 py-1.5">{t('remoteLabel')}</span>
        )}
        <span
          className={
            posting.daysLeft <= 7
              ? 'rounded-full bg-accent-soft px-3 py-1.5 font-semibold text-on-accent-soft'
              : 'rounded-full bg-primary-soft px-3 py-1.5 text-on-primary-soft'
          }
        >
          {posting.daysLeft === 0 ? t('today') : t('daysLeft', { count: posting.daysLeft })}
        </span>
        <span className="rounded-full bg-surface-strong px-3 py-1.5 text-fg">
          {t(posting.kind)}
        </span>
      </div>
      <div className="mt-auto flex min-w-0 items-end justify-between gap-3 border-t border-border pt-4">
        <p className="min-w-0 break-words text-sm text-fg-muted">
          <span className="font-semibold">{t('target')}:</span>{' '}
          {posting.targetDepartments.map((d) => d.name).join(', ')}
        </p>
        <Link
          href={`/ilanlar/${encodeURIComponent(posting.id)}`}
          className="press-control inline-flex min-h-11 shrink-0 items-center font-semibold text-primary hover:underline"
        >
          {t('open')} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </Card>
  );
}
export function PostingList({
  page,
  filters,
  options,
  canPost,
}: {
  page: JobPostingPage;
  filters: SearchJobPostingsInput;
  options: JobPostingFilterOptions;
  canPost: boolean;
}) {
  const t = useTranslations('jobs');
  const filtered = Boolean(
    filters.q ||
    filters.departmentId ||
    filters.companyId ||
    filters.organizationName ||
    filters.location ||
    filters.kind ||
    filters.remote ||
    filters.withinDays !== undefined,
  );
  function pageHref(target: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (key !== 'page' && key !== 'pageSize' && value !== undefined && value !== false)
        params.set(key, String(value));
    }
    if (target > 1) params.set('page', String(target));
    return `/ilanlar${params.size ? `?${params}` : ''}`;
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="font-semibold text-accent-strong">{t('eyebrow')}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-3 text-fg-muted">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canPost ? (
            <Link className={buttonClasses()} href="/ilanlar/yeni">
              {t('post')}
            </Link>
          ) : (
            <p className="max-w-xs text-sm text-fg-muted">{t('studentReason')}</p>
          )}
          {canPost && (
            <Link className={buttonClasses({ variant: 'secondary' })} href="/ilanlarim">
              {t('mine')}
            </Link>
          )}
        </div>
      </header>
      <form
        action="/ilanlar"
        className="mb-8 rounded-3xl border border-border bg-surface p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="job-q" className="sr-only">
            {t('search')}
          </label>
          <Input
            id="job-q"
            type="search"
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder={t('search')}
            minLength={2}
            maxLength={100}
          />
          <Button type="submit">{t('searchButton')}</Button>
        </div>
        <details className="mt-4" open={filtered}>
          <summary className="press-control flex min-h-11 cursor-pointer items-center font-semibold text-primary">
            {t('filters')}
          </summary>
          <div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-2 font-medium">
              {t('department')}
              <Select name="departmentId" defaultValue={filters.departmentId ?? ''}>
                <option value="">{t('all')}</option>
                {options.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-2 font-medium">
              {t('company')}
              <Select
                name="organization"
                defaultValue={
                  options.organizations.find((c) =>
                    c.companyId
                      ? c.companyId === filters.companyId
                      : c.name === filters.organizationName,
                  )?.key ?? ''
                }
              >
                <option value="">{t('all')}</option>
                {options.organizations.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-2 font-medium">
              {t('kind')}
              <Select name="kind" defaultValue={filters.kind ?? ''}>
                <option value="">{t('allTypes')}</option>
                <option value="INTERNSHIP">{t('INTERNSHIP')}</option>
                <option value="JOB">{t('JOB')}</option>
              </Select>
            </label>
            <label className="grid gap-2 font-medium">
              {t('withinDays')}
              <Select name="withinDays" defaultValue={filters.withinDays?.toString() ?? ''}>
                <option value="">{t('anyTime')}</option>
                <option value="0">{t('today')}</option>
                <option value="7">{t('sevenDays')}</option>
                <option value="14">{t('fourteenDays')}</option>
              </Select>
            </label>
            <label className="grid gap-2 font-medium">
              {t('location')}
              <Select name="location" defaultValue={filters.location ?? ''}>
                <option value="">{t('all')}</option>
                {options.locations.map((location) => (
                  <option key={location.name} value={location.name}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex min-h-11 items-center gap-3 font-medium">
              <input
                type="checkbox"
                name="remote"
                value="true"
                defaultChecked={filters.remote === true}
                className="size-5 accent-primary"
              />
              {t('remote')}
            </label>
          </div>
        </details>
      </form>
      <p className="mb-4 font-semibold text-fg">{t('results', { count: page.total })}</p>
      {page.items.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {page.items.map((posting) => (
            <PostingCard key={posting.id} posting={posting} />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-border bg-surface">
          <EmptyState
            title={t('emptyTitle')}
            description={t(filtered ? 'emptyFiltered' : 'emptyBody')}
            action={
              filtered ? (
                <Link href="/ilanlar" className={buttonClasses({ variant: 'secondary' })}>
                  {t('clear')}
                </Link>
              ) : canPost ? (
                <Link href="/ilanlar/yeni" className={buttonClasses()}>
                  {t('post')}
                </Link>
              ) : undefined
            }
          />
        </div>
      )}
      <Pagination
        className="mt-6"
        page={page.page}
        pageCount={Math.ceil(page.total / page.pageSize)}
        hrefFor={pageHref}
      />
    </div>
  );
}
