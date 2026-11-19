'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  alumniSearchSchema,
  type AlumniPage,
  type AlumniSearch,
} from '@/contracts/alumni-directory';
import { SearchBar } from '@/components/directory/search-bar';
import { FilterChip } from '@/components/directory/filter-chip';
import {
  Button,
  ChevronDownIcon,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Sheet,
  Skeleton,
  buttonClasses,
} from '@/components/ui';

type Values = {
  q: string;
  sectorId: string;
  company: string;
  title: string;
  skill: string;
  city: string;
  graduationFrom: string;
  graduationTo: string;
};
const keys = [
  'q',
  'sectorId',
  'company',
  'title',
  'skill',
  'city',
  'graduationFrom',
  'graduationTo',
] as const;
export function AlumniDirectory({
  results,
  filter,
  sectors,
}: {
  results: AlumniPage;
  filter: AlumniSearch;
  sectors: { id: string; name: string }[];
}) {
  const t = useTranslations('alumniDirectory');
  const directory = useTranslations('directory');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [draft, setDraft] = useState<Values>(
    () =>
      Object.fromEntries(
        keys.map((key) => [key, filter[key] === undefined ? '' : String(filter[key])]),
      ) as Values,
  );
  function navigate(values: Values, page = 1) {
    if (pending) return;
    const params = new URLSearchParams();
    for (const key of keys) if (values[key].trim()) params.set(key, values[key].trim());
    if (page > 1) params.set('page', String(page));
    const input = Object.fromEntries(params);
    if (!alumniSearchSchema.safeParse(input).success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setOpen(false);
    startTransition(() => router.push(`/mezunlar${params.size ? `?${params}` : ''}`));
  }
  const set = (key: keyof Values, value: string) => {
    setDraft((old) => ({ ...old, [key]: value }));
    setInvalid(false);
  };
  const fields = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(['company', 'title', 'skill', 'city'] as const).map((key) => (
        <Field
          key={key}
          label={t(key)}
          error={invalid && draft[key].trim().length === 1 ? t('invalid') : undefined}
        >
          {(control) => (
            <Input
              {...control}
              value={draft[key]}
              maxLength={100}
              onChange={(event) => set(key, event.target.value)}
            />
          )}
        </Field>
      ))}
      {(['graduationFrom', 'graduationTo'] as const).map((key) => (
        <Field
          key={key}
          label={t(key)}
          error={invalid && Boolean(draft[key]) ? t('invalid') : undefined}
        >
          {(control) => (
            <Input
              {...control}
              inputMode="numeric"
              type="number"
              min={1900}
              max={2100}
              value={draft[key]}
              onChange={(event) => set(key, event.target.value)}
            />
          )}
        </Field>
      ))}
    </div>
  );
  return (
    <div className="w-full">
      <PageHeader eyebrow={t('eyebrow')} title={t('titlePage')} description={t('description')} />
      <div className="mt-6 flex min-w-0 flex-wrap items-start gap-2">
        <SearchBar
          action="/mezunlar"
          className="min-w-0 flex-[1_1_100%] !rounded-none !border-0 !bg-transparent !p-0 !shadow-none lg:flex-[1_1_18rem]"
          label={t('search')}
          hint={t('searchHint')}
          submitLabel={t('searchButton')}
          error={invalid && draft.q.trim().length === 1 ? t('invalid') : undefined}
          pendingReason={pending ? t('loading') : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            navigate(draft);
          }}
          input={{
            name: 'q',
            value: draft.q,
            maxLength: 100,
            onChange: (event) => set('q', event.target.value),
          }}
        >
          {keys
            .filter((key) => key !== 'q' && draft[key].trim())
            .map((key) => (
              <input key={key} type="hidden" name={key} value={draft[key]} />
            ))}
        </SearchBar>
        <label className="flex min-h-11 min-w-0 flex-1 basis-full items-center gap-2 rounded-full border border-border-control bg-surface px-3 text-sm font-semibold lg:basis-auto">
          <span>{t('sector')}</span>
          <span className="relative inline-flex min-w-0 flex-1">
            <select
              className="min-h-11 min-w-0 w-full appearance-none bg-transparent pr-8 text-base text-fg"
              value={draft.sectorId}
              onChange={(event) => {
                const values = { ...draft, sectorId: event.target.value };
                setDraft(values);
                navigate(values);
              }}
            >
              <option value="">{t('all')}</option>
              {sectors.map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.name}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-fg-muted"
            />
          </span>
        </label>
        <Button variant="secondary" className="lg:hidden" onClick={() => setOpen(true)}>
          {t('filters')}
        </Button>
      </div>
      <details className="mt-2 hidden lg:block">
        <summary className="press-control inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
          {t('filters')}
        </summary>
        <div className="rounded-card border border-border bg-surface p-4">
          {fields}
          <Button className="mt-4" onClick={() => navigate(draft)}>
            {t('apply')}
          </Button>
        </div>
      </details>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('filters')}
        footer={<Button onClick={() => navigate(draft)}>{t('apply')}</Button>}
      >
        {fields}
      </Sheet>
      <section className="mt-6" aria-busy={pending}>
        <p className="font-semibold" aria-live="polite">
          {t('count', { count: results.total })}
        </p>
        {keys.some((key) => filter[key] !== undefined) && (
          <div aria-label={directory('active')} className="mt-4 flex flex-wrap gap-2">
            {keys
              .filter((key) => filter[key] !== undefined)
              .map((key) => (
                <FilterChip
                  key={key}
                  label={
                    key === 'sectorId'
                      ? (sectors.find((sector) => sector.id === filter.sectorId)?.name ??
                        String(filter[key]))
                      : String(filter[key])
                  }
                  onRemove={() => {
                    const next = { ...draft, [key]: '' };
                    setDraft(next);
                    navigate(next);
                  }}
                />
              ))}
          </div>
        )}
        {pending ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status">
            <span className="sr-only">{t('loading')}</span>
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : results.items.length === 0 && results.total > 0 && filter.page > 1 ? (
          <EmptyState
            title={t('pageEmpty')}
            description={t('pageEmptyDescription')}
            action={
              <Button variant="secondary" onClick={() => navigate(draft, 1)}>
                {t('firstPage')}
              </Button>
            }
          />
        ) : results.items.length === 0 ? (
          <EmptyState
            title={t('empty')}
            description={t('emptyDescription')}
            action={
              keys.some((key) => filter[key] !== undefined) ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const empty = Object.fromEntries(keys.map((key) => [key, ''])) as Values;
                    setDraft(empty);
                    navigate(empty);
                  }}
                >
                  {t('clear')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {results.items.map((item) => (
              <article
                key={item.userId}
                className="flex flex-col rounded-card border border-border bg-surface p-5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-on-primary-soft"
                  >
                    {item.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toLocaleUpperCase('tr-TR')}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-bold">{item.name}</h2>
                    {item.position && (
                      <p className="mt-1 text-sm">
                        {item.position.title} · {item.position.company}
                      </p>
                    )}
                  </div>
                </div>
                {item.position?.sector && (
                  <p className="mt-4 text-sm text-fg-muted">{item.position.sector}</p>
                )}
                {item.graduationYear && (
                  <p className="mt-2 text-sm text-fg-muted">
                    {t('graduated', { year: item.graduationYear })}
                  </p>
                )}
                <div className="mt-auto pt-5">
                  <Link
                    className={buttonClasses({ fullWidth: true })}
                    aria-label={t('contactLabel', { name: item.name })}
                    href={`/iletisim-iste/${item.userId}?donus=%2Fmezunlar`}
                  >
                    {t('contact')}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
        {(filter.page > 1 || results.hasMore) && (
          <div className="mt-6 flex gap-3">
            {filter.page > 1 && (
              <Button variant="secondary" onClick={() => navigate(draft, filter.page - 1)}>
                {t('previous')}
              </Button>
            )}
            {results.hasMore && (
              <Button variant="secondary" onClick={() => navigate(draft, filter.page + 1)}>
                {t('next')}
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
