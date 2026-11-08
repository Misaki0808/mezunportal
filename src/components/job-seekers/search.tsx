'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button, EmptyState, PageHeader, Select, Switch } from '@/components/ui';
import type { HiringDeclaration, SeekerPage, SeekerTermSeason } from '@/contracts/job-seekers';
import { searchSeekers, setHiringDeclaration } from '@/server/actions/job-seekers';
import type messages from '../../../messages/tr.json';
import { SeekerCardView } from './card';

type Department = { id: string; name: string; facultyName: string; universityName: string };
type Tag = { id: string; slug: string };
export function SeekerSearch({
  initial,
  departments,
  tags,
}: {
  initial: HiringDeclaration;
  departments: Department[];
  tags: Tag[];
}) {
  const t = useTranslations('seekers');
  const tagLabels = useTranslations('profileTags');
  const errors = useTranslations('errors.codes');
  const [hiring, setHiring] = useState(initial.hiring);
  const [departmentId, setDepartmentId] = useState('');
  const [tag, setTag] = useState('');
  const [year, setYear] = useState('');
  const [season, setSeason] = useState<SeekerTermSeason | ''>('');
  const [results, setResults] = useState<SeekerPage | null>(null);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  function updateHiring(next: boolean) {
    setError('');
    start(async () => {
      try {
        const r = await setHiringDeclaration({ hiring: next });
        if (!r.ok) {
          setError(errors(r.errorCode));
          return;
        }
        setHiring(r.data.hiring);
        if (!r.data.hiring) setResults(null);
      } catch {
        setError(errors('SERVER_UNEXPECTED'));
      }
    });
  }
  function search(page = 1) {
    setError('');
    start(async () => {
      try {
        const r = await searchSeekers({
          ...(departmentId ? { departmentId } : {}),
          ...(tag ? { tags: [tag] } : {}),
          ...(year ? { termYear: Number(year) } : {}),
          ...(season ? { termSeason: season } : {}),
          page,
        });
        if (!r.ok) {
          setError(errors(r.errorCode));
          return;
        }
        setResults(r.data);
      } catch {
        setError(errors('SERVER_UNEXPECTED'));
      }
    });
  }
  return (
    <div className="mx-auto max-w-4xl space-y-7 px-5 py-10 pb-28">
      <Link
        href="/hesap"
        className="press-control inline-flex min-h-11 items-center font-semibold text-primary"
      >
        ← {t('backAccount')}
      </Link>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('searchTitle')}
        description={t('searchDescription')}
      />
      <div className="rounded-card border border-border p-5">
        <Switch
          label={t('hiring')}
          description={t('hiringHint')}
          checked={hiring}
          disabled={pending}
          onChange={(e) => updateHiring(e.target.checked)}
        />
      </div>
      {!hiring ? (
        <p className="rounded-card bg-primary-soft p-5 text-on-primary-soft">{t('hiringPrompt')}</p>
      ) : (
        <>
          <section className="space-y-4 rounded-card border border-border p-5">
            <h2 className="text-lg font-semibold">{t('filters')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1">
                <span>{t('department')}</span>
                <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">{t('allDepartments')}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.facultyName}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span>{t('interest')}</span>
                <Select value={tag} onChange={(e) => setTag(e.target.value)}>
                  <option value="">{t('allInterests')}</option>
                  {tags
                    .filter((x) => tagLabels.has(x.slug as keyof typeof messages.profileTags))
                    .map((x) => (
                      <option key={x.id} value={x.slug}>
                        {tagLabels(x.slug as keyof typeof messages.profileTags)}
                      </option>
                    ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span>{t('year')}</span>
                <Select value={year} onChange={(e) => setYear(e.target.value)}>
                  <option value="">{t('anyYear')}</option>
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + i).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span>{t('season')}</span>
                <Select
                  value={season}
                  onChange={(e) => setSeason(e.target.value as SeekerTermSeason | '')}
                >
                  <option value="">{t('anySeason')}</option>
                  {(['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`seasons.${s}`)}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <Button onClick={() => search()} loading={pending}>
              {t('search')}
            </Button>
          </section>
          {results && (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">{t('results')}</h2>
              <p className="text-sm text-fg-muted">
                {t('remaining', { count: results.remainingCardsToday })}
              </p>
              {results.items.length ? (
                <ul className="grid gap-4 sm:grid-cols-2">
                  {results.items.map((card) => (
                    <li key={card.ref} className="space-y-2">
                      <SeekerCardView card={card} />
                      <Link
                        className="press-control inline-flex min-h-11 items-center font-semibold text-primary"
                        href={`/adaylar/${encodeURIComponent(card.ref)}/iletisim`}
                      >
                        {t('contact')}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title={t('empty')} description={t('emptyHint')} />
              )}
              <div className="flex flex-wrap gap-3">
                {results.page > 1 && (
                  <Button
                    variant="secondary"
                    loading={pending}
                    onClick={() => search(results.page - 1)}
                  >
                    {t('previous')}
                  </Button>
                )}
                {results.page * results.pageSize < results.total &&
                  results.remainingCardsToday > 0 && (
                    <Button
                      variant="secondary"
                      loading={pending}
                      onClick={() => search(results.page + 1)}
                    >
                      {t('next')}
                    </Button>
                  )}
              </div>
            </section>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
