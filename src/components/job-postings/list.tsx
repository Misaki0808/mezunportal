'use client';

import Link from 'next/link';
import messages from '../../../messages/tr.json';
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  JobPostingCard,
  JobPostingPage,
  SearchJobPostingsInput,
  JobPostingFilterOptions,
} from '@/contracts/job-postings';
import {
  Button,
  Checkbox,
  Card,
  Badge,
  IconChip,
  EmptyState,
  Field,
  Pagination,
  Select,
  Sheet,
  buttonClasses,
} from '@/components/ui';
import { SearchBar } from '@/components/directory/search-bar';

export function PostingCard({ posting }: { posting: JobPostingCard }) {
  const t = useTranslations('jobs');
  const ui = useTranslations('ui');
  const tagLabels = useTranslations('profileTags');
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
      className="group flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-sm sm:gap-5 transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none sm:p-6"
    >
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <IconChip
          tone={posting.kind === 'JOB' ? 'success' : 'primary'}
          className="rounded-control font-bold sm:size-14 sm:text-lg"
        >
          {initials}
        </IconChip>
        <div className="min-w-0">
          <p
            className="truncate text-xs font-semibold text-fg-muted sm:whitespace-normal sm:text-sm"
            title={posting.organizationName}
          >
            {posting.companyId ? (
              <Link
                className="inline-flex min-h-11 items-center underline decoration-border-control underline-offset-4"
                href={`/sirketler/${posting.companyId}`}
              >
                {posting.organizationName}
              </Link>
            ) : (
              posting.organizationName
            )}
          </p>
          <h2 className="mt-0.5 break-words text-lg font-bold leading-tight text-fg sm:mt-1 sm:text-xl">
            <Link
              className="press-control flex min-h-11 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-primary"
              href={`/ilanlar/${encodeURIComponent(posting.id)}`}
            >
              <span className="line-clamp-2 sm:line-clamp-none">{posting.title}</span>
              <span aria-hidden="true" className="ml-auto pl-2 text-primary sm:hidden">
                →
              </span>
            </Link>
          </h2>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        <Badge title={posting.location ?? undefined} className="max-w-full truncate">
          {posting.location ?? (posting.isRemote ? t('remoteLabel') : t('unknownLocation'))}
        </Badge>
        {posting.location && posting.isRemote && <Badge tone="category">{t('remoteLabel')}</Badge>}
        <Badge tone={posting.daysLeft <= 7 ? 'accent' : 'info'}>
          {posting.daysLeft === 0 ? t('today') : t('daysLeft', { count: posting.daysLeft })}
        </Badge>
        <Badge tone="category">{t(posting.kind)}</Badge>
      </div>
      {!!posting.matchTags?.length && (
        <div className="flex min-w-0 items-center gap-1.5 text-xs sm:flex-col sm:items-start sm:gap-2">
          <p className="shrink-0 font-semibold">{t('whyMatch')}</p>
          <div className="flex min-w-0 gap-1 overflow-x-auto sm:flex-wrap sm:gap-2">
            {posting.matchTags.map((tag) => (
              <Badge key={tag.slug} tone="info" className="max-w-full shrink-0">
                {tag.label ??
                  (tag.slug in messages.profileTags
                    ? tagLabels(tag.slug as keyof typeof messages.profileTags)
                    : tag.slug)}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div className="mt-auto flex min-w-0 items-end justify-between gap-3 border-t border-border pt-2 sm:pt-4">
        <p
          className="min-w-0 truncate text-xs text-fg-muted sm:break-words sm:whitespace-normal sm:text-sm"
          title={posting.targetDepartments.map((d) => d.name).join(', ')}
        >
          <span className="sr-only font-semibold sm:not-sr-only">{t('target')}:</span>{' '}
          {posting.targetDepartments.map((d) => d.name).join(', ')}
        </p>
        <Link
          href={`/ilanlar/${encodeURIComponent(posting.id)}`}
          aria-label={ui('namedAction', { action: t('open'), target: posting.title })}
          className="press-control hidden min-h-11 shrink-0 sm:inline-flex items-center gap-1 font-semibold text-primary hover:underline"
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
  const filterFormId = useId();
  const [query, setQuery] = useState(filters.q ?? '');
  const [open, setOpen] = useState(false);
  const [filterEpoch, setFilterEpoch] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const filterFields = (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label={t('department')}>
        {(props) => (
          <Select {...props} name="departmentId" defaultValue={filters.departmentId ?? ''}>
            <option value="">{t('all')}</option>
            {options.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('company')}>
        {(props) => (
          <Select
            {...props}
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
        )}
      </Field>
      <Field label={t('kind')}>
        {(props) => (
          <Select {...props} name="kind" defaultValue={filters.kind ?? ''}>
            <option value="">{t('allTypes')}</option>
            <option value="INTERNSHIP">{t('INTERNSHIP')}</option>
            <option value="JOB">{t('JOB')}</option>
          </Select>
        )}
      </Field>
      <Field label={t('withinDays')}>
        {(props) => (
          <Select {...props} name="withinDays" defaultValue={filters.withinDays?.toString() ?? ''}>
            <option value="">{t('anyTime')}</option>
            <option value="0">{t('today')}</option>
            <option value="7">{t('sevenDays')}</option>
            <option value="14">{t('fourteenDays')}</option>
          </Select>
        )}
      </Field>
      <Field label={t('location')}>
        {(props) => (
          <Select {...props} name="location" defaultValue={filters.location ?? ''}>
            <option value="">{t('all')}</option>
            {options.locations.map((location) => (
              <option key={location.name} value={location.name}>
                {location.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Checkbox
        label={t('remote')}
        name="remote"
        value="true"
        defaultChecked={filters.remote === true}
        className="font-medium"
      />
    </div>
  );
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
    <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-8 lg:py-12">
      <header className="mb-4 flex items-start justify-between gap-3 sm:mb-8 sm:gap-4">
        <div className="min-w-0 max-w-2xl">
          <p className="sr-only font-semibold text-accent-strong sm:not-sr-only">{t('eyebrow')}</p>
          <h1 className="text-2xl font-bold tracking-tight text-fg sm:mt-2 sm:text-4xl">
            <span className="sm:hidden">{t('compactTitle')}</span>
            <span className="hidden sm:inline">{t('title')}</span>
          </h1>
          <p className="mt-1 text-sm text-fg-muted sm:mt-3 sm:text-base">{t('subtitle')}</p>
          {!canPost && (
            <p className="mt-1 text-xs text-fg-muted sm:text-sm">{t('studentReason')}</p>
          )}
        </div>
        {canPost && (
          <div className="flex shrink-0 flex-col items-stretch gap-1 sm:flex-row sm:gap-3">
            <Link className={buttonClasses()} href="/ilanlar/yeni">
              {t('post')}
            </Link>
            <Link className={buttonClasses({ variant: 'secondary' })} href="/ilanlarim">
              {t('mine')}
            </Link>
          </div>
        )}
      </header>
      <SearchBar
        action="/ilanlar"
        className="mb-4 sm:mb-8"
        label={t('search')}
        hint={t('searchPlaceholder')}
        submitLabel={t('searchButton')}
        pendingReason={navigating ? t('loading') : undefined}
        onSubmit={() => setNavigating(true)}
        trailing={
          <Button
            variant="secondary"
            className="shrink-0 whitespace-nowrap lg:hidden"
            onClick={() => {
              setFilterEpoch((value) => value + 1);
              setOpen(true);
            }}
          >
            {t('filters')}
          </Button>
        }
        input={{
          name: 'q',
          value: query,
          onChange: (event) => setQuery(event.target.value),
          minLength: 2,
          maxLength: 100,
        }}
      >
        <details className="mt-4 hidden lg:block" open={filtered}>
          <summary className="press-control flex min-h-11 cursor-pointer items-center font-semibold text-primary">
            {t('filters')}
          </summary>
          {filterFields}
        </details>
      </SearchBar>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('filters')}
        footer={
          <>
            <Button type="submit" form={filterFormId} loading={navigating}>
              {t('applyFilters')}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
          </>
        }
      >
        <form
          id={filterFormId}
          key={filterEpoch}
          action="/ilanlar"
          onSubmit={() => setNavigating(true)}
        >
          <input type="hidden" name="q" value={query} />
          {filterFields}
        </form>
      </Sheet>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4">
        <p className="font-semibold text-fg">{t('results', { count: page.total })}</p>
        {filtered && (
          <Link
            href="/ilanlar"
            className="press-control inline-flex min-h-11 items-center font-medium text-primary hover:underline"
          >
            {t('clear')}
          </Link>
        )}
      </div>
      {page.items.length ? (
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          {page.items.map((posting) => (
            <PostingCard key={posting.id} posting={posting} />
          ))}
        </div>
      ) : (
        <div className="rounded-card border border-dashed border-border bg-surface">
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
