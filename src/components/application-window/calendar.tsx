'use client';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Field, IconChip, PageHeader, Select } from '@/components/ui';
import type { ApplicationCalendar, ApplicationScope } from '@/contracts/application-window';
import { setApplicationFollow } from '@/server/actions/application-window';

type Option = { id: string; name: string };
export function CalendarView({
  scope,
  data,
}: {
  scope: ApplicationScope;
  data: ApplicationCalendar;
}) {
  const t = useTranslations('applicationCalendar');
  const errors = useTranslations('errors.codes');
  const [following, setFollowing] = useState(data.isFollowing);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const counts = new Map(data.months.map((item) => [item.month, item.count]));
  const max = Math.max(1, ...data.months.map((item) => item.count));
  function toggle() {
    setError('');
    start(async () => {
      const result = await setApplicationFollow({ scope, following: !following });
      if (!result.ok) {
        setError(errors(result.errorCode));
        return;
      }
      setFollowing(result.data.following);
    });
  }
  return (
    <section className="grid gap-5">
      {data.canFollow && (
        <div>
          <Button
            variant="secondary"
            loading={pending}
            onClick={toggle}
            leadingIcon={<IconChip className="size-7">{following ? '✓' : '+'}</IconChip>}
          >
            {following ? t('unfollow') : t('follow')}
          </Button>
          {following && (
            <p role="status" className="mt-2 text-fg-muted">
              {t('following')}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-danger">
              {error}
            </p>
          )}
        </div>
      )}
      {data.months.length === 0 ? (
        <p className="rounded-card border border-border p-5 text-fg-muted">{t('empty')}</p>
      ) : (
        <>
          <p className="text-fg-muted">{t('note')}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
              const count = counts.get(month);
              return (
                <div
                  key={month}
                  className={`rounded-control p-3 text-center ${count ? (count / max >= 0.7 ? 'bg-primary text-on-primary' : 'bg-primary-soft text-on-primary-soft') : 'bg-surface text-fg-muted'}`}
                >
                  <span className="block">{t(`months.${month as 1}`)}</span>
                  <span className="block font-semibold">{count ?? t('hidden')}</span>
                </div>
              );
            })}
          </div>
          <table className="sr-only">
            <caption>{t('title')}</caption>
            <thead>
              <tr>
                <th>{t('month')}</th>
                <th>{t('count')}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <tr key={month}>
                  <th scope="row">{t(`months.${month as 1}`)}</th>
                  <td>{counts.get(month) ?? t('hidden')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
export function CalendarPage({
  companies,
  sectors,
  scope,
  data,
}: {
  companies: Option[];
  sectors: Option[];
  scope: ApplicationScope | null;
  data: ApplicationCalendar | null;
}) {
  const t = useTranslations('applicationCalendar');
  const [companyId, setCompanyId] = useState(scope?.kind === 'COMPANY' ? scope.id : '');
  const [sectorId, setSectorId] = useState(scope?.kind === 'SECTOR' ? scope.id : '');
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28">
      <PageHeader title={t('title')} description={t('description')} />
      <form action="/basvuru-takvimi" className="mt-7 grid gap-3 sm:grid-cols-2">
        <Field label={t('company')}>
          {(control) => (
            <Select
              {...control}
              name="companyId"
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value);
                if (event.target.value) setSectorId('');
              }}
            >
              <option value="">{t('allCompanies')}</option>
              {companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('sector')}>
          {(control) => (
            <Select
              {...control}
              name="sectorId"
              value={sectorId}
              onChange={(event) => {
                setSectorId(event.target.value);
                if (event.target.value) setCompanyId('');
              }}
            >
              <option value="">{t('allSectors')}</option>
              {sectors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit">{t('open')}</Button>
      </form>
      {!scope && (
        <p className="mt-8 rounded-card border border-border p-5 text-fg-muted">
          {t('chooseScope')}
        </p>
      )}
      {scope && data && (
        <div className="mt-8">
          <CalendarView key={`${scope.kind}:${scope.id}`} scope={scope} data={data} />
        </div>
      )}
    </div>
  );
}
