'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  APPLICATION_CHANNELS,
  EXPERIENCE_PAY,
  EXPERIENCE_TYPES,
  TERM_SEASONS,
} from '@/contracts/experience';
import {
  searchExperiencesSchema,
  searchFilterToParams,
  type SearchExperiencesInput,
  type SearchPage,
} from '@/contracts/search';
import { FilterShell, type ActiveFilter } from '@/components/directory/filter-shell';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pagination,
  Select,
  buttonClasses,
} from '@/components/ui';

type Filter = SearchExperiencesInput;
type Props = {
  filter: Filter;
  results: SearchPage;
  sectors: { id: string; name: string }[];
};
export function SearchScreen({ filter, results, sectors }: Props) {
  const t = useTranslations('search');
  const router = useRouter();
  const [draft, setDraft] = useState<Filter>(filter);
  const [invalid, setInvalid] = useState(false);
  const [pending, startTransition] = useTransition();
  const href = (next: Filter) => {
    const params = searchFilterToParams(next).toString();
    return `/deneyimler${params ? `?${params}` : ''}`;
  };
  /** Geçerliyse URL'e yazar (`true`); geçersizse alan hatasını gösterir ve `false` döner (alt sayfa açık kalır). */
  function go(next: Filter): boolean {
    if (pending) return false;
    const parsed = searchExperiencesSchema.safeParse(next);
    if (!parsed.success) {
      setInvalid(true);
      return false;
    }
    setInvalid(false);
    startTransition(() => router.push(href(parsed.data)));
    return true;
  }
  const update = (next: Partial<Filter>) =>
    setDraft((previous) => ({ ...previous, ...next, page: 1 }));
  const chips = [
    ...(filter.types ?? []).map((value) => ({
      key: `type-${value}`,
      label: t(`types.${value}`),
      remove: { types: filter.types?.filter((v) => v !== value) },
    })),
    ...(filter.channels ?? []).map((value) => ({
      key: `channel-${value}`,
      label: t(`channels.${value}`),
      remove: { channels: filter.channels?.filter((v) => v !== value) },
    })),
    ...(filter.company
      ? [{ key: 'company', label: filter.company, remove: { company: undefined } }]
      : []),
    ...(filter.sectorId
      ? [
          {
            key: 'sector',
            label: sectors.find((s) => s.id === filter.sectorId)?.name ?? filter.sectorId,
            remove: { sectorId: undefined },
          },
        ]
      : []),
    ...(filter.termYear
      ? [{ key: 'year', label: String(filter.termYear), remove: { termYear: undefined } }]
      : []),
    ...(filter.termSeason
      ? [
          {
            key: 'season',
            label: t(`seasons.${filter.termSeason}`),
            remove: { termSeason: undefined },
          },
        ]
      : []),
    ...(filter.pay
      ? [{ key: 'pay', label: t(`payments.${filter.pay}`), remove: { pay: undefined } }]
      : []),
  ];
  const active: ActiveFilter[] = chips.map((chip) => ({
    key: chip.key,
    label: chip.label,
    onRemove: () => go({ ...filter, ...chip.remove, page: 1 }),
  }));
  const filters = (
    <div className="flex flex-col gap-5">
      <Field label={t('type')}>
        {(props) => (
          <Select
            {...props}
            value={draft.types?.[0] ?? ''}
            onChange={(e) =>
              update({
                types: e.target.value
                  ? [e.target.value as (typeof EXPERIENCE_TYPES)[number]]
                  : undefined,
              })
            }
          >
            <option value="">{t('all')}</option>
            {EXPERIENCE_TYPES.map((v) => (
              <option key={v} value={v}>
                {t(`types.${v}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label={t('company')}
        error={
          invalid && draft.company && draft.company.trim().length < 2 ? t('invalid') : undefined
        }
      >
        {(props) => (
          <Input
            {...props}
            value={draft.company ?? ''}
            onChange={(e) => update({ company: e.target.value || undefined })}
            maxLength={100}
          />
        )}
      </Field>
      {sectors.length > 0 ? (
        <Field label={t('sector')}>
          {(props) => (
            <Select
              {...props}
              value={draft.sectorId ?? ''}
              onChange={(e) => update({ sectorId: e.target.value || undefined })}
            >
              <option value="">{t('all')}</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <p className="text-sm text-fg-muted">{t('noSectors')}</p>
      )}
      <Field label={t('channel')}>
        {(props) => (
          <Select
            {...props}
            value={draft.channels?.[0] ?? ''}
            onChange={(e) =>
              update({
                channels: e.target.value
                  ? [e.target.value as (typeof APPLICATION_CHANNELS)[number]]
                  : undefined,
              })
            }
          >
            <option value="">{t('all')}</option>
            {APPLICATION_CHANNELS.map((v) => (
              <option key={v} value={v}>
                {t(`channels.${v}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label={t('year')}
        error={
          invalid &&
          draft.termYear !== undefined &&
          (draft.termYear < 1900 || draft.termYear > 2100 || !Number.isInteger(draft.termYear))
            ? t('yearInvalid')
            : undefined
        }
      >
        {(props) => (
          <Input
            {...props}
            inputMode="numeric"
            type="number"
            min={1900}
            max={2100}
            value={draft.termYear ?? ''}
            onChange={(e) =>
              update({ termYear: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        )}
      </Field>
      <Field label={t('season')}>
        {(props) => (
          <Select
            {...props}
            value={draft.termSeason ?? ''}
            onChange={(e) =>
              update({ termSeason: (e.target.value || undefined) as Filter['termSeason'] })
            }
          >
            <option value="">{t('all')}</option>
            {TERM_SEASONS.map((v) => (
              <option key={v} value={v}>
                {t(`seasons.${v}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('pay')}>
        {(props) => (
          <Select
            {...props}
            value={draft.pay ?? ''}
            onChange={(e) => update({ pay: (e.target.value || undefined) as Filter['pay'] })}
          >
            <option value="">{t('all')}</option>
            {EXPERIENCE_PAY.map((v) => (
              <option key={v} value={v}>
                {t(`payments.${v}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 pt-10 sm:pt-14">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')}>
        <Link href="/deneyimlerim" className={`${buttonClasses({ variant: 'secondary' })} mt-4`}>
          {t('mine')}
        </Link>
      </PageHeader>
      <form
        className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-start"
        onSubmit={(event) => {
          event.preventDefault();
          go({ ...draft, page: 1 });
        }}
      >
        <Field
          className="flex-1"
          label={t('query')}
          hint={t('queryHint')}
          error={invalid && draft.q && draft.q.trim().length < 2 ? t('invalid') : undefined}
        >
          {(props) => (
            <Input
              {...props}
              type="search"
              maxLength={100}
              value={draft.q ?? ''}
              onChange={(e) => update({ q: e.target.value || undefined, sort: undefined })}
            />
          )}
        </Field>
        {/* Düğme girdiyle hizalı: etiket satırı (1,75 rem) + boşluk (0,375 rem) kadar aşağıda; ipucu satırı hizayı bozmaz. */}
        <div className="sm:mt-[2.125rem]">
          <Button
            type="submit"
            loading={pending}
            {...(pending
              ? { disabled: true as const, disabledReason: t('loading') }
              : { disabled: false as const })}
          >
            {t('submit')}
          </Button>
        </div>
      </form>
      <FilterShell
        active={active}
        total={results.total}
        pending={pending}
        onApply={() => go({ ...draft, page: 1 })}
        onReset={() => setDraft(filter)}
        onClear={() => go({ q: filter.q, page: 1 })}
        results={
          results.items.length === 0 ? (
            <EmptyState
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              action={
                <div className="flex flex-col gap-3">
                  <Button variant="secondary" onClick={() => go({})}>
                    {t('clear')}
                  </Button>
                  <Link href="/deneyim/yeni" className={buttonClasses({ variant: 'secondary' })}>
                    {t('write')}
                  </Link>
                </div>
              }
            />
          ) : (
            <ul className="mt-5 flex flex-col gap-4">
              {results.items.map((item) => (
                <li key={item.id} className="rounded-card border border-border p-5 shadow-card">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="category">{t(`types.${item.type}`)}</Badge>
                    {item.termYear && <Badge>{String(item.termYear)}</Badge>}
                  </div>
                  <h2 className="mt-3 break-words text-xl font-semibold">
                    {item.organizationName ?? item.departmentName}
                  </h2>
                  <p className="mt-1 text-sm text-fg-muted">
                    {item.isAnonymous ? t('anonymous') : t('by', { name: item.author.displayName })}
                  </p>
                  <p className="mt-1 text-sm text-fg-muted">{item.departmentName}</p>
                  {item.snippet && (
                    <p className="mt-4 whitespace-pre-line break-words">{item.snippet}</p>
                  )}
                  <Link
                    className={`${buttonClasses({ variant: 'secondary' })} mt-4`}
                    href={`/deneyim/${item.id}`}
                  >
                    {t('open')}
                  </Link>
                </li>
              ))}
            </ul>
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
