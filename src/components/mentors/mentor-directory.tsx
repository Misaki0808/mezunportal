'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { EXPERIENCE_TYPES } from '@/contracts/experience';
import {
  MEETING_MODES,
  MENTOR_TYPES,
  mentorFilterToParams,
  searchMentorsSchema,
  type MentorPage,
  type SearchMentorsInput,
  type SimilarMentors,
} from '@/contracts/mentor-directory';
import {
  Button,
  buttonClasses,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pagination,
  Select,
  Switch,
  Sheet,
  Skeleton,
} from '@/components/ui';
import type { ActiveFilter } from '@/components/directory/filter-shell';
import { FilterChip } from '@/components/directory/filter-chip';

import { MentorCard } from './mentor-card';
import { SimilarMentors as SimilarSection } from './similar-mentors';

type Filter = SearchMentorsInput;
type ListKey = 'mentorTypes' | 'experienceTypes' | 'meetingModes';

type Props = {
  filter: Filter;
  results: MentorPage;
  sectors: { id: string; name: string }[];
  similar: SimilarMentors | null;
  /** Mentor olabilen ama profili henüz kapalı kullanıcı: boş dizinde eylem "mentorluğu aç" olur. */
  canOpenMentoring?: boolean;
};

const BASE_PATH = '/mentorlar';

/** Mentor bul: filtreler URL'de; mobilde alt sayfa, geniş ekranda kenar paneli (ortak `FilterShell`). */
export function MentorDirectory({
  filter,
  results,
  sectors,
  similar,
  canOpenMentoring = false,
}: Props) {
  const t = useTranslations('mentors');
  const directory = useTranslations('directory');
  const experienceTypes = useTranslations('experiences.types');
  const router = useRouter();
  const [draft, setDraft] = useState<Filter>(filter);
  const [invalid, setInvalid] = useState(false);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const href = (next: Filter) => {
    const params = mentorFilterToParams(next).toString();
    return `${BASE_PATH}${params ? `?${params}` : ''}`;
  };

  /** Geçerliyse URL'e yazar (`true`); geçersizse alan hatasını gösterir ve `false` döner. */
  function go(next: Filter): boolean {
    if (pending) return false;
    const parsed = searchMentorsSchema.safeParse(next);
    if (!parsed.success) {
      setInvalid(true);
      return false;
    }
    setInvalid(false);
    startTransition(() => router.push(href(parsed.data)));
    return true;
  }

  const update = (patch: Partial<Filter>) =>
    setDraft((previous) => ({ ...previous, ...patch, page: 1 }));
  const toggle = (key: ListKey, value: string) =>
    setDraft((previous) => {
      const current = (previous[key] ?? []) as string[];
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return { ...previous, [key]: next.length > 0 ? next : undefined, page: 1 } as Filter;
    });

  const labelOf = (key: ListKey, value: string) =>
    key === 'mentorTypes'
      ? t(`types.${value as 'ALUMNI'}`)
      : key === 'meetingModes'
        ? t(`modes.${value as 'ONLINE'}`)
        : experienceTypes(value as 'INTERNSHIP');

  const active: ActiveFilter[] = [
    ...(['mentorTypes', 'experienceTypes', 'meetingModes'] as const).flatMap((key) =>
      ((filter[key] ?? []) as string[]).map((value) => ({
        key: `${key}-${value}`,
        label: labelOf(key, value),
        onRemove: () =>
          go({
            ...filter,
            [key]: ((filter[key] ?? []) as string[]).filter((item) => item !== value).length
              ? ((filter[key] ?? []) as string[]).filter((item) => item !== value)
              : undefined,
            page: 1,
          } as Filter),
      })),
    ),
    ...(filter.sectorId
      ? [
          {
            key: 'sector',
            label: sectors.find((sector) => sector.id === filter.sectorId)?.name ?? filter.sectorId,
            onRemove: () => go({ ...filter, sectorId: undefined, page: 1 }),
          },
        ]
      : []),
    ...(filter.company
      ? [
          {
            key: 'company',
            label: filter.company,
            onRemove: () => go({ ...filter, company: undefined, page: 1 }),
          },
        ]
      : []),
    ...(filter.title
      ? [
          {
            key: 'title',
            label: filter.title,
            onRemove: () => go({ ...filter, title: undefined, page: 1 }),
          },
        ]
      : []),
    ...(filter.skill
      ? [
          {
            key: 'skill',
            label: filter.skill,
            onRemove: () => go({ ...filter, skill: undefined, page: 1 }),
          },
        ]
      : []),
    ...(filter.onlyAvailable
      ? [
          {
            key: 'available',
            label: t('filters.onlyAvailable'),
            onRemove: () => go({ ...filter, onlyAvailable: undefined, page: 1 }),
          },
        ]
      : []),
  ];

  const group = (key: ListKey, legend: string, values: readonly string[]) => (
    <fieldset className="flex flex-col">
      <legend className="mb-1 font-medium text-fg">{legend}</legend>
      {values.map((value) => (
        <Checkbox
          key={value}
          label={labelOf(key, value)}
          checked={((draft[key] ?? []) as string[]).includes(value)}
          onChange={() => toggle(key, value)}
        />
      ))}
    </fieldset>
  );

  const tooShort = (value?: string) => invalid && value !== undefined && value.trim().length < 2;
  const filters = (includeQuick: boolean) => (
    <div className="flex flex-col gap-5">
      {includeQuick && (
        <>
          <Switch
            label={t('filters.onlyAvailable')}
            description={t('filters.onlyAvailableHint')}
            checked={draft.onlyAvailable === true}
            onChange={(event) => update({ onlyAvailable: event.target.checked || undefined })}
          />
          {group('mentorTypes', t('filters.mentorTypes'), MENTOR_TYPES)}
          {sectors.length > 0 ? (
            <Field label={t('filters.sector')}>
              {(control) => (
                <Select
                  {...control}
                  value={draft.sectorId ?? ''}
                  onChange={(event) => update({ sectorId: event.target.value || undefined })}
                >
                  <option value="">{t('filters.all')}</option>
                  {sectors.map((sector) => (
                    <option key={sector.id} value={sector.id}>
                      {sector.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <p className="text-sm text-fg-muted">{t('filters.noSectors')}</p>
          )}
        </>
      )}
      <Field
        label={t('filters.company')}
        error={tooShort(draft.company) ? t('filters.invalid') : undefined}
      >
        {(control) => (
          <Input
            {...control}
            maxLength={100}
            value={draft.company ?? ''}
            onChange={(event) => update({ company: event.target.value || undefined })}
          />
        )}
      </Field>
      <Field
        label={t('filters.title')}
        error={tooShort(draft.title) ? t('filters.invalid') : undefined}
      >
        {(control) => (
          <Input
            {...control}
            maxLength={100}
            value={draft.title ?? ''}
            onChange={(event) => update({ title: event.target.value || undefined })}
          />
        )}
      </Field>
      <Field label={t('filters.skill')}>
        {(control) => (
          <Input
            {...control}
            maxLength={200}
            value={draft.skill ?? ''}
            onChange={(event) => update({ skill: event.target.value || undefined })}
          />
        )}
      </Field>
      {group('meetingModes', t('filters.meetingModes'), MEETING_MODES)}
      {group('experienceTypes', t('filters.experienceTypes'), EXPERIENCE_TYPES)}
    </div>
  );

  const hasFilter = active.length > 0;
  // Aralık dışı sayfa: toplam var ama bu sayfa boş; "henüz mentor yok" demek çelişir.
  const outOfRange = results.items.length === 0 && results.page > 1;
  const quickToggle = (key: 'mentorTypes' | 'onlyAvailable', value?: string) => {
    const current = filter.mentorTypes ?? [];
    const next: Filter =
      key === 'onlyAvailable'
        ? { ...filter, onlyAvailable: !filter.onlyAvailable, page: 1 }
        : {
            ...filter,
            mentorTypes: current.includes(value as (typeof MENTOR_TYPES)[number])
              ? current.filter((item) => item !== value)
              : [...current, value as (typeof MENTOR_TYPES)[number]],
            page: 1,
          };
    if (next.mentorTypes?.length === 0) next.mentorTypes = undefined;
    setDraft(next);
    go(next);
  };
  const chipClass = (selected: boolean) =>
    `press-control inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary ${selected ? 'border-primary bg-primary text-white' : 'border-border-control bg-surface text-fg'}`;
  const close = () => {
    setDraft(filter);
    setOpen(false);
  };
  const apply = () => {
    if (go({ ...draft, page: 1 })) setOpen(false);
  };
  const clear = () => {
    setDraft({});
    go({});
  };
  return (
    <div className="w-full max-w-[1280px] px-4 pb-12 pt-6 sm:px-6 lg:pt-8">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <div className="mt-6 flex min-w-0 items-start gap-2">
        <div
          className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-2"
          role="group"
          aria-label={directory('filters')}
        >
          <button
            type="button"
            aria-pressed={filter.onlyAvailable === true}
            disabled={pending}
            className={chipClass(filter.onlyAvailable === true)}
            onClick={() => quickToggle('onlyAvailable')}
          >
            {t('filters.onlyAvailable')}
          </button>
          {MENTOR_TYPES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={(filter.mentorTypes ?? []).includes(value)}
              disabled={pending}
              className={chipClass((filter.mentorTypes ?? []).includes(value))}
              onClick={() => quickToggle('mentorTypes', value)}
            >
              {t(`types.${value}`)}
            </button>
          ))}
          {sectors.length > 0 && (
            <label className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border-control bg-surface px-3 text-sm font-semibold">
              <span>{t('filters.sector')}</span>
              <select
                className="min-h-11 max-w-40 bg-transparent text-fg"
                value={filter.sectorId ?? ''}
                disabled={pending}
                onChange={(event) => {
                  const next = { ...filter, sectorId: event.target.value || undefined, page: 1 };
                  setDraft(next);
                  go(next);
                }}
              >
                <option value="">{t('filters.all')}</option>
                {sectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>
                    {sector.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <Button variant="secondary" className="shrink-0 lg:hidden" onClick={() => setOpen(true)}>
          {directory('filters')}
        </Button>
      </div>
      <details className="mt-2 hidden lg:block">
        <summary className="press-control inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
          {t('filters.more')}
        </summary>
        <div className="mt-3 rounded-card border border-border bg-surface p-5">
          {filters(false)}
          <div className="mt-5">
            <Button
              loading={pending}
              {...(pending
                ? { disabled: true as const, disabledReason: directory('loading') }
                : { disabled: false as const })}
              onClick={apply}
            >
              {directory('apply')}
            </Button>
          </div>
        </div>
      </details>
      <Sheet
        open={open}
        onClose={close}
        title={directory('filters')}
        footer={
          <>
            <Button
              loading={pending}
              {...(pending
                ? { disabled: true as const, disabledReason: directory('loading') }
                : { disabled: false as const })}
              onClick={apply}
            >
              {directory('apply')}
            </Button>
            <Button variant="secondary" onClick={close}>
              {directory('cancel')}
            </Button>
          </>
        }
      >
        {filters(true)}
      </Sheet>
      <section aria-busy={pending} className="mt-6 min-w-0">
        {similar && <SimilarSection data={similar} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!hasFilter && results.total === 0 ? (
            <span aria-live="polite" />
          ) : (
            <p className="font-semibold" aria-live="polite">
              {directory('resultCount', { count: results.total })}
            </p>
          )}
          {active.length > 0 && (
            <Button variant="secondary" onClick={clear}>
              {directory('clear')}
            </Button>
          )}
        </div>
        {active.length > 0 && (
          <div aria-label={directory('active')} className="mt-4 flex flex-wrap gap-2">
            {active.map((chip) => (
              <FilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
            ))}
          </div>
        )}
        {pending ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status">
            <span className="sr-only">{directory('loading')}</span>
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : outOfRange ? (
          <EmptyState
            title={directory('pageEmptyTitle')}
            description={directory('pageEmptyDescription')}
            action={
              <Link
                href={href({ ...filter, page: 1 })}
                className={buttonClasses({ variant: 'secondary' })}
              >
                {directory('firstPage')}
              </Link>
            }
          />
        ) : results.items.length === 0 ? (
          <EmptyState
            title={hasFilter ? t('empty.title') : t('empty.none')}
            description={
              hasFilter
                ? t('empty.description')
                : t(canOpenMentoring ? 'empty.noneMentorDescription' : 'empty.noneDescription')
            }
            action={
              hasFilter ? (
                <Button variant="secondary" onClick={() => go({})}>
                  {directory('clear')}
                </Button>
              ) : canOpenMentoring ? (
                <Link href="/mentor/ayarlar" className={buttonClasses()}>
                  {t('empty.noneMentorAction')}
                </Link>
              ) : (
                <Link href="/deneyimler" className={buttonClasses()}>
                  {t('empty.noneAction')}
                </Link>
              )
            }
          />
        ) : (
          <>
            <h2 className="sr-only">{t('resultsHeading')}</h2>
            <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {results.items.map((mentor) => (
                <li key={mentor.userId} className="min-w-0">
                  <MentorCard mentor={mentor} returnTo={href(filter)} />
                </li>
              ))}
            </ul>
          </>
        )}
        <Pagination
          className="mt-6"
          page={results.page}
          pageCount={Math.ceil(results.total / results.pageSize)}
          hrefFor={(page) => href({ ...filter, page })}
        />
      </section>
    </div>
  );
}
