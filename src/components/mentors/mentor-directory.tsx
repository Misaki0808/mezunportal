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
} from '@/components/ui';
import { FilterShell, type ActiveFilter } from '@/components/directory/filter-shell';

import { MentorCard } from './mentor-card';
import { SimilarMentors as SimilarSection } from './similar-mentors';

type Filter = SearchMentorsInput;
type ListKey = 'mentorTypes' | 'experienceTypes' | 'meetingModes';

type Props = {
  filter: Filter;
  results: MentorPage;
  sectors: { id: string; name: string }[];
  similar: SimilarMentors | null;
};

const BASE_PATH = '/mentorlar';

/** Mentor bul: filtreler URL'de; mobilde alt sayfa, geniş ekranda kenar paneli (ortak `FilterShell`). */
export function MentorDirectory({ filter, results, sectors, similar }: Props) {
  const t = useTranslations('mentors');
  const directory = useTranslations('directory');
  const experienceTypes = useTranslations('experiences.types');
  const router = useRouter();
  const [draft, setDraft] = useState<Filter>(filter);
  const [invalid, setInvalid] = useState(false);
  const [pending, startTransition] = useTransition();

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
  const filters = (
    <div className="flex flex-col gap-5">
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
  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 pt-10 sm:pt-14">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <FilterShell
        active={active}
        total={results.total}
        hideCount={!hasFilter && results.total === 0}
        pending={pending}
        onApply={() => go({ ...draft, page: 1 })}
        onReset={() => setDraft(filter)}
        onClear={() => {
          setDraft({});
          go({});
        }}
        lead={similar ? <SimilarSection data={similar} /> : undefined}
        results={
          results.items.length === 0 ? (
            <EmptyState
              title={hasFilter ? t('empty.title') : t('empty.none')}
              description={hasFilter ? t('empty.description') : t('empty.noneDescription')}
              action={
                hasFilter ? (
                  <Button variant="secondary" onClick={() => go({})}>
                    {directory('clear')}
                  </Button>
                ) : (
                  <Link href="/deneyimler" className={buttonClasses()}>
                    {t('empty.noneAction')}
                  </Link>
                )
              }
            />
          ) : (
            <>
              {/* Mobilde filtre paneli kapalıyken kartların (h3) üstünde h2 bulunsun: başlık atlaması yok. */}
              <h2 className="sr-only">{t('resultsHeading')}</h2>
              <ul className="mt-5 flex flex-col gap-4">
                {results.items.map((mentor) => (
                  <li key={mentor.userId}>
                    <MentorCard mentor={mentor} returnTo={href(filter)} />
                  </li>
                ))}
              </ul>
            </>
          )
        }
        pagination={
          <Pagination
            className="mt-6"
            page={results.page}
            pageCount={Math.ceil(results.total / results.pageSize)}
            hrefFor={(page) => href({ ...filter, page })}
          />
        }
      >
        {filters}
      </FilterShell>
    </div>
  );
}
