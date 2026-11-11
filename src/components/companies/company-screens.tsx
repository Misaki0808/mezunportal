'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import type { CompaniesPage, CompanyDetail, CompanySummary } from '@/contracts/companies';
import { mergeCompaniesSchema } from '@/contracts/companies';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconChip,
  Input,
  Modal,
  PageHeader,
  Select,
  Tabs,
  buttonClasses,
} from '@/components/ui';
import { MentorCard } from '@/components/mentors/mentor-card';
import { mergeCompanies, searchCompanies } from '@/server/actions/companies';
import type { InterviewQuestionBank } from '@/contracts/interview-questions';
import { QuestionCards } from '@/components/interview-questions/question-bank';
import { CalendarView } from '@/components/application-window/calendar';
import type { ApplicationCalendar } from '@/contracts/application-window';

function CompanyCard({ company }: { company: CompanySummary }) {
  const t = useTranslations('companies');
  return (
    <li>
      <Link
        href={`/sirketler/${company.slug}`}
        className="press-row flex min-h-24 items-center gap-4 rounded-card border border-border bg-surface p-4 shadow-card"
      >
        <IconChip>{company.name.slice(0, 1).toLocaleUpperCase('tr-TR')}</IconChip>
        <span className="min-w-0">
          <span className="block break-words text-lg font-semibold">{company.name}</span>
          <span className="block text-fg-muted">{company.sector ?? t('sectorUnknown')}</span>
        </span>
      </Link>
    </li>
  );
}
export function CompaniesIndex({ data, query }: { data: CompaniesPage; query: string }) {
  const t = useTranslations('companies');
  const popularIds = new Set(data.popular.map((company) => company.id));
  const remaining = query
    ? data.companies
    : data.companies.filter((company) => !popularIds.has(company.id));
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pb-28">
      <PageHeader title={t('title')} description={t('description')} />
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/mulakat-sorulari" className={buttonClasses({ variant: 'secondary' })}>
          {t('interviewLink')}
        </Link>
        <Link href="/basvuru-takvimi" className={buttonClasses({ variant: 'secondary' })}>
          {t('calendarLink')}
        </Link>
      </div>
      <form action="/sirketler" className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field className="min-w-0 flex-1" label={t('searchLabel')}>
          {(p) => <Input {...p} name="q" defaultValue={query} autoComplete="organization" />}
        </Field>
        <Button type="submit">{t('search')}</Button>
      </form>
      {data.popular.length > 0 && !query && (
        <section className="mt-9">
          <h2 className="text-xl font-semibold">{t('popular')}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.popular.map((company) => (
              <CompanyCard key={company.id} company={company} />
            ))}
          </ul>
        </section>
      )}
      {(remaining.length > 0 || data.popular.length === 0 || !!query) && (
        <section className="mt-9">
          <h2 className="text-xl font-semibold">{t('results')}</h2>
          {remaining.length ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {remaining.map((company) => (
                <CompanyCard key={company.id} company={company} />
              ))}
            </ul>
          ) : (
            <EmptyState title={t('none')} description={t('noneHint')} />
          )}
        </section>
      )}
    </div>
  );
}
export function CompanyScreen({
  company,
  questions,
  calendar,
}: {
  company: CompanyDetail;
  questions: InterviewQuestionBank;
  calendar: ApplicationCalendar;
}) {
  const t = useTranslations('companies');
  const experience = useTranslations('experiences');
  const jobs = useTranslations('jobs');
  const interviews = useTranslations('interviewBank');
  const tabs = [
    {
      id: 'experiences',
      label: t('experiences'),
      content: company.experiences.length ? (
        <ul className="grid gap-3">
          {company.experiences.map((item) => (
            <li
              key={item.id}
              className="rounded-card border border-border bg-surface p-5 shadow-card"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="category">{experience(`types.${item.type as 'INTERNSHIP'}`)}</Badge>
                <span className="text-fg-muted">
                  {item.isAnonymous ? t('anonymous') : (item.author?.name ?? t('anonymous'))}
                </span>
              </div>
              <p className="mt-3 break-words">{item.snippet}</p>
              <Link
                href={`/deneyim/${item.id}`}
                className={`${buttonClasses({ variant: 'secondary' })} mt-4`}
              >
                {t('viewExperience')}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={t('emptyExperience')}
          description={t('emptyExperienceHint')}
          action={
            <Link href="/deneyim/yeni" className={buttonClasses()}>
              {t('share')}
            </Link>
          }
        />
      ),
    },
    {
      id: 'interviews',
      label: interviews('tab'),
      content: <QuestionCards groups={questions.groups} insufficient={questions.insufficient} />,
    },
    {
      id: 'periods',
      label: t('periods'),
      content: <CalendarView scope={{ kind: 'COMPANY', id: company.id }} data={calendar} />,
    },
    {
      id: 'mentors',
      label: t('mentors'),
      content: company.mentors.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {company.mentors.map((mentor) => (
            <li key={mentor.userId}>
              <MentorCard mentor={mentor} compact />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('emptyMentors')} />
      ),
    },
    ...(company.postings.length
      ? [
          {
            id: 'jobs',
            label: t('jobs'),
            content: (
              <ul className="grid gap-3">
                {company.postings.map((posting) => (
                  <li key={posting.id} className="rounded-card border border-border p-4">
                    <Badge tone="category">{jobs(posting.kind)}</Badge>
                    <Link
                      href={`/ilanlar/${posting.id}`}
                      className="mt-2 block min-h-11 break-words text-lg font-semibold text-primary"
                    >
                      {posting.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28">
      <Link
        href="/sirketler"
        className="press-control inline-flex min-h-11 items-center font-semibold text-primary"
      >
        ← {t('back')}
      </Link>
      <header className="mt-4 flex min-w-0 items-start gap-4">
        <IconChip tone="accent" className="size-16 text-2xl font-semibold">
          {company.name.slice(0, 1).toLocaleUpperCase('tr-TR')}
        </IconChip>
        <div className="min-w-0">
          <PageHeader title={company.name} description={company.sector ?? t('sectorUnknown')} />
        </div>
      </header>
      {(company.alumni.current !== null || company.alumni.former !== null) && (
        <div className="mt-6 flex flex-wrap gap-3">
          {company.alumni.current !== null && (
            <Badge>
              {t('currentAlumni')}: {company.alumni.current}
            </Badge>
          )}
          {company.alumni.former !== null && (
            <Badge>
              {t('formerAlumni')}: {company.alumni.former}
            </Badge>
          )}
        </div>
      )}
      <Tabs className="mt-8" label={t('tabs')} items={tabs} />
    </div>
  );
}

export function CompanyMerge() {
  const t = useTranslations('companies');
  const errors = useTranslations('errors.codes');
  const [queries, setQueries] = useState({ source: '', target: '' });
  const [options, setOptions] = useState<{ source: CompanySummary[]; target: CompanySummary[] }>({
    source: [],
    target: [],
  });
  const [selected, setSelected] = useState({ source: '', target: '' });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [pending, start] = useTransition();
  function lookup(which: 'source' | 'target') {
    start(async () => {
      const result = await searchCompanies({ q: queries[which] });
      if (!result.ok) {
        setError(errors(result.errorCode));
        return;
      }
      setOptions((old) => ({ ...old, [which]: result.data.companies }));
    });
  }
  function confirm() {
    const parsed = mergeCompaniesSchema.safeParse({
      sourceId: selected.source,
      targetId: selected.target,
    });
    if (!parsed.success) {
      setError(t('chooseDifferent'));
      return;
    }
    start(async () => {
      const result = await mergeCompanies(parsed.data);
      if (!result.ok) {
        setError(errors(result.errorCode));
        return;
      }
      setOpen(false);
      setSuccess(true);
      setSelected({ source: '', target: '' });
    });
  }
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <PageHeader title={t('mergeTitle')} description={t('mergeDescription')} />
      <div className="mt-7 grid gap-6">
        {(['source', 'target'] as const).map((which) => (
          <div key={which} className="grid gap-3 rounded-card border border-border p-4">
            <Field label={t(which === 'source' ? 'mergeSource' : 'mergeTarget')}>
              {(p) => (
                <Input
                  {...p}
                  value={queries[which]}
                  onChange={(e) => setQueries({ ...queries, [which]: e.target.value })}
                />
              )}
            </Field>
            <Button variant="secondary" loading={pending} onClick={() => lookup(which)}>
              {t('search')}
            </Button>
            <Field label={t('mergeSelect')}>
              {(p) => (
                <Select
                  {...p}
                  value={selected[which]}
                  onChange={(e) => setSelected({ ...selected, [which]: e.target.value })}
                >
                  <option value="">{t('mergeSelect')}</option>
                  {options[which].map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        ))}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        {success && <p role="status">{t('mergeSuccess')}</p>}
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] bg-bg pb-4 pt-3 lg:bottom-0">
          <Button
            fullWidth
            onClick={() => {
              setError('');
              setOpen(true);
            }}
          >
            {t('merge')}
          </Button>
        </div>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('mergeTitle')}
        description={t('mergeConfirm')}
        footer={
          <>
            <Button variant="danger" loading={pending} onClick={confirm}>
              {t('merge')}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
          </>
        }
      >
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </Modal>
    </div>
  );
}
