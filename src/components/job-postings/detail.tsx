'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { parseApplyUrl, type JobPostingDetail } from '@/contracts/job-postings';
import { Card, buttonClasses } from '@/components/ui';

export function PostingDetail({
  posting,
  canRequestContact = false,
}: {
  posting: JobPostingDetail;
  canRequestContact?: boolean;
}) {
  const t = useTranslations('jobs');
  const url =
    posting.applyMethod === 'URL' && posting.applyUrl ? parseApplyUrl(posting.applyUrl) : null;
  const contact =
    posting.applyMethod === 'CONTACT_REQUEST' && canRequestContact
      ? `/ilanlar/${encodeURIComponent(posting.id)}/iletisim`
      : null;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/ilanlar"
        className="press-control inline-flex min-h-11 items-center font-semibold text-primary"
      >
        ← {t('back')}
      </Link>
      <Card
        as="article"
        padding="none"
        className="mt-3 rounded-3xl border border-border bg-surface p-5 sm:p-8"
      >
        <header>
          <p className="break-words font-semibold text-accent-strong">{posting.organizationName}</p>
          <h1 className="mt-2 break-words text-3xl font-bold sm:text-4xl">{posting.title}</h1>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-primary-soft px-3 py-2 text-on-primary-soft">
              {t(posting.kind)}
            </span>
            <span className="max-w-full break-words rounded-full bg-surface-strong px-3 py-2 [overflow-wrap:anywhere]">
              {posting.location ?? (posting.isRemote ? t('remoteLabel') : t('unknownLocation'))}
            </span>
            {posting.location && posting.isRemote && (
              <span className="rounded-full bg-surface-strong px-3 py-1.5">{t('remoteLabel')}</span>
            )}
            <span
              className={
                posting.daysLeft <= 7
                  ? 'rounded-full bg-accent-soft px-3 py-2 font-semibold text-on-accent-soft'
                  : 'max-w-full break-words rounded-full bg-surface-strong px-3 py-2 [overflow-wrap:anywhere]'
              }
            >
              {posting.daysLeft === 0 ? t('today') : t('daysLeft', { count: posting.daysLeft })}
            </span>
          </div>
        </header>
        <section className="mt-8 border-t border-border pt-7">
          <h2 className="text-xl font-bold">{t('description')}</h2>
          <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed text-fg">
            {posting.description}
          </p>
          <p className="mt-6 break-words text-sm text-fg-muted">
            <strong>{t('target')}:</strong>{' '}
            {posting.targetDepartments.map((d) => d.name).join(', ')}
          </p>
        </section>
        <div className="mt-8">
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses()}>
              {t('apply')} <span aria-hidden="true">↗</span>
              <span className="sr-only"> {t('newTab')}</span>
            </a>
          )}
          {posting.applyMethod === 'CONTACT_REQUEST' && !canRequestContact && (
            <p className="text-fg-muted">{t('contactUnavailable')}</p>
          )}
          {contact && (
            <Link href={contact} className={buttonClasses()}>
              {t('contact')}
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}
