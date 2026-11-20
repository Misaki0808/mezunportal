'use client';

import Link from 'next/link';
import messages from '../../../messages/tr.json';
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type {
  JobPostingCard,
  JobPostingPage,
  SearchJobPostingsInput,
  JobPostingFilterOptions,
} from '@/contracts/job-postings';
import {
  Button,
  ChevronDownIcon,
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
import { omitEmptyFields } from '@/components/directory/omit-empty-fields';
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
        <Badge title={posting.location ?? undefined} className="max-w-full">
          {/* Rozet inline-flex olduğundan `truncate` kapsayıcıda üç nokta çizmez; metin kendi kutusunda kesilir. */}
          <span className="min-w-0 truncate">
            {posting.location ?? (posting.isRemote ? t('remoteLabel') : t('unknownLocation'))}
          </span>
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
  sectors = [],
}: {
  page: JobPostingPage;
  filters: SearchJobPostingsInput;
  options: JobPostingFilterOptions;
  canPost: boolean;
  sectors?: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('jobs');
  const directory = useTranslations('directory');
  const filterFormId = useId();
  const router = useRouter();
  const [query, setQuery] = useState(filters.q ?? '');
  const [queryError, setQueryError] = useState(false);
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
      <Field label={t('sector')}>
        {(props) => (
          <Select {...props} name="sectorId" defaultValue={filters.sectorId ?? ''}>
            <option value="">{t('all')}</option>
            {sectors.map((sector) => (
              <option key={sector.id} value={sector.id}>
                {sector.name}
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
    filters.sectorId ||
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
  function quickFilter(patch: Partial<SearchJobPostingsInput>) {
    if (navigating) return;
    const trimmed = query.trim();
    if (trimmed.length === 1) {
      setQueryError(true);
      return;
    }
    setQueryError(false);
    const next = { ...filters, q: trimmed || undefined, ...patch };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (
        key !== 'page' &&
        key !== 'pageSize' &&
        value !== undefined &&
        value !== false &&
        value !== ''
      )
        params.set(key, String(value));
    }
    setNavigating(true);
    router.push(`/ilanlar${params.size ? `?${params}` : ''}`);
  }
  const quickClass = (selected: boolean) =>
    `press-control inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary ${selected ? 'border-primary bg-primary text-on-primary' : 'border-border-control bg-surface text-fg'}`;
  return (
    <div className="w-full">
      <header className="mb-3 flex items-start justify-between gap-3 sm:mb-8 sm:gap-4">
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
            {(page.total > 0 || filtered) && (
              <Link className={buttonClasses()} href="/ilanlar/yeni">
                {t('post')}
              </Link>
            )}
            <Link className={buttonClasses({ variant: 'secondary' })} href="/ilanlarim">
              {t('mine')}
            </Link>
          </div>
        )}
      </header>
      <div className="mb-2 flex min-w-0 flex-wrap items-start gap-2 sm:mb-6">
        <SearchBar
          action="/ilanlar"
          className="min-w-0 flex-[1_1_20rem] !rounded-none !border-0 !bg-transparent !p-0 !shadow-none"
          label={t('search')}
          hint={t('searchPlaceholder')}
          error={queryError ? t('searchInvalid') : undefined}
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
            onChange: (event) => {
              setQuery(event.target.value);
              setQueryError(false);
            },
            minLength: 2,
            maxLength: 100,
          }}
        >
          <details
            className="mt-4 hidden lg:block"
            open={Boolean(
              filters.departmentId ||
              filters.sectorId ||
              filters.companyId ||
              filters.organizationName ||
              filters.withinDays !== undefined,
            )}
          >
            <summary className="press-control flex min-h-11 cursor-pointer items-center font-semibold text-primary">
              {t('filters')}
            </summary>
            {filterFields}
          </details>
        </SearchBar>
        <div
          className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-2"
          role="group"
          aria-label={t('filters')}
        >
          {(['INTERNSHIP', 'JOB'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={filters.kind === kind}
              disabled={navigating}
              className={quickClass(filters.kind === kind)}
              onClick={() => quickFilter({ kind: filters.kind === kind ? undefined : kind })}
            >
              {t(kind)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={filters.remote === true}
            disabled={navigating}
            className={quickClass(filters.remote === true)}
            onClick={() => quickFilter({ remote: !filters.remote })}
          >
            {t('remoteLabel')}
          </button>
          {options.locations.length > 0 && (
            <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold">
              <span>{t('location')}</span>
              <span className="relative inline-flex">
                <select
                  className="min-h-11 max-w-40 appearance-none rounded-full border border-border-control bg-surface py-2 pr-8 pl-3 text-base text-fg"
                  value={filters.location ?? ''}
                  disabled={navigating}
                  onChange={(event) => quickFilter({ location: event.target.value || undefined })}
                >
                  <option value="">{t('all')}</option>
                  {options.locations.map((location) => (
                    <option key={location.name} value={location.name}>
                      {location.name}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-fg-muted"
                />
              </span>
            </label>
          )}
        </div>
      </div>
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
          ref={omitEmptyFields}
          id={filterFormId}
          key={filterEpoch}
          action="/ilanlar"
          onSubmit={() => setNavigating(true)}
        >
          <input type="hidden" name="q" value={query} />
          {filterFields}
        </form>
      </Sheet>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 sm:mb-4">
        {(page.total > 0 || filtered) && (
          <p className="font-semibold text-fg">{t('results', { count: page.total })}</p>
        )}
        {filtered && (
          <Link
            href="/ilanlar"
            className="press-control inline-flex min-h-11 items-center font-medium text-primary hover:underline"
          >
            {t('clear')}
          </Link>
        )}
      </div>
      {page.items.length === 0 && page.total > 0 ? (
        // Aralık dışı sayfa: ilan var ama bu sayfa boş; "henüz ilan yok" demek sayaçla çelişir.
        <div className="rounded-card border border-dashed border-border bg-surface">
          <EmptyState
            title={directory('pageEmptyTitle')}
            description={directory('pageEmptyDescription')}
            action={
              <Link href={pageHref(1)} className={buttonClasses({ variant: 'secondary' })}>
                {directory('firstPage')}
              </Link>
            }
          />
        </div>
      ) : page.items.length ? (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {page.items.map((posting) => (
            <PostingCard key={posting.id} posting={posting} />
          ))}
        </div>
      ) : (
        <div className="rounded-card border border-dashed border-border bg-surface">
          <EmptyState
            title={t(filtered ? 'emptyTitle' : 'emptyNoneTitle')}
            description={t(filtered ? 'emptyFiltered' : canPost ? 'emptyBodyPoster' : 'emptyBody')}
            action={
              filtered ? (
                <Link href="/ilanlar" className={buttonClasses({ variant: 'secondary' })}>
                  {t('clear')}
                </Link>
              ) : canPost ? (
                <Link href="/ilanlar/yeni" className={buttonClasses()}>
                  {t('post')}
                </Link>
              ) : (
                <Link href="/profil" className={buttonClasses({ variant: 'secondary' })}>
                  {t('emptyProfile')}
                </Link>
              )
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
