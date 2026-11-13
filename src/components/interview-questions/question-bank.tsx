'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { InterviewFilters, InterviewQuestionBank } from '@/contracts/interview-questions';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  buttonClasses,
} from '@/components/ui';

type Group = InterviewQuestionBank['groups'][number];
export function QuestionCards({
  groups,
  insufficient,
}: {
  groups: Group[];
  insufficient: boolean;
}) {
  const t = useTranslations('interviewBank');
  if (!groups.length)
    return (
      <EmptyState
        title={insufficient ? t('insufficient') : t('empty')}
        description={t('emptyHint')}
        action={
          <Link href="/deneyim/yeni" className={buttonClasses()}>
            {t('share')}
          </Link>
        }
      />
    );
  return (
    <div className="grid gap-7">
      {groups.map((group) => (
        <section key={group.companyId}>
          <h2 className="text-xl font-semibold">
            <Link
              href={`/sirketler/${group.companySlug}`}
              className="press-control inline-flex min-h-11 items-center text-primary"
            >
              {group.companyName}
            </Link>
          </h2>
          <ul className="mt-2 grid gap-3">
            {group.questions.map((question) => (
              <li
                key={`${question.category}-${question.text}`}
                className="rounded-card border border-border bg-surface p-5 shadow-card"
              >
                <div className="flex flex-wrap gap-2">
                  <Badge tone="category">
                    {t(question.category === 'QUESTION' ? 'question' : 'process')}
                  </Badge>
                  <Badge>{t('count', { count: question.count })}</Badge>
                </div>
                <p className="mt-3 break-words text-base">{question.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
export function QuestionBank({
  data,
  filters,
}: {
  data: InterviewQuestionBank;
  filters: InterviewFilters;
}) {
  const t = useTranslations('interviewBank');
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  const pageLink = (page: number) => {
    const params = new URLSearchParams();
    if (filters.companyId) params.set('companyId', filters.companyId);
    if (filters.sectorId) params.set('sectorId', filters.sectorId);
    if (filters.q) params.set('q', filters.q);
    params.set('page', String(page));
    return `/mulakat-sorulari?${params.toString()}`;
  };
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pb-28">
      <PageHeader title={t('title')} description={t('description')} />
      <form
        action="/mulakat-sorulari"
        className="mt-7 grid gap-4 rounded-card border border-border p-4 sm:grid-cols-2"
      >
        <Field label={t('company')}>
          {(props) => (
            <Select {...props} name="companyId" defaultValue={filters.companyId}>
              <option value="">{t('allCompanies')}</option>
              {data.companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('sector')}>
          {(props) => (
            <Select {...props} name="sectorId" defaultValue={filters.sectorId}>
              <option value="">{t('allSectors')}</option>
              {data.sectors.map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('search')}>
          {(props) => <Input {...props} name="q" defaultValue={filters.q} maxLength={100} />}
        </Field>
        <div className="flex items-end">
          <Button type="submit" fullWidth>
            {t('apply')}
          </Button>
        </div>
      </form>
      <div className="mt-8">
        {data.total > 0 && (
          <p className="mb-4 text-fg-muted">{t('totalCompanies', { count: data.total })}</p>
        )}
        <QuestionCards groups={data.groups} insufficient={data.insufficient} />
        {pageCount > 1 && (
          <nav aria-label={t('pagination')} className="mt-6 flex flex-wrap items-center gap-3">
            {data.page > 1 && (
              <Link
                className={buttonClasses({ variant: 'secondary' })}
                href={pageLink(data.page - 1)}
              >
                {t('previous')}
              </Link>
            )}
            <span>{t('page', { page: data.page, total: pageCount })}</span>
            {data.page < pageCount && (
              <Link
                className={buttonClasses({ variant: 'secondary' })}
                href={pageLink(data.page + 1)}
              >
                {t('next')}
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
