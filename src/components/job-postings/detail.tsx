'use client';
import Link from 'next/link';
import messages from '../../../messages/tr.json';
import { useTranslations } from 'next-intl';
import { parseApplyUrl, type JobPostingDetail } from '@/contracts/job-postings';
import { BackLink, Badge, PageHeader, buttonClasses } from '@/components/ui';
import { ReportPosting } from './report';
import { SharedBy } from './shared-by';

export function PostingDetail({
  posting,
  canRequestContact = false,
}: {
  posting: JobPostingDetail;
  canRequestContact?: boolean;
}) {
  const t = useTranslations('jobs');
  const tagLabels = useTranslations('profileTags');
  const url =
    posting.applyMethod === 'URL' && posting.applyUrl ? parseApplyUrl(posting.applyUrl) : null;
  const contact =
    posting.applyMethod === 'CONTACT_REQUEST' && canRequestContact
      ? `/ilanlar/${encodeURIComponent(posting.id)}/iletisim`
      : null;
  const action = url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses()}>
      {t('apply')} <span aria-hidden="true">↗</span>
      <span className="sr-only"> {t('newTab')}</span>
    </a>
  ) : contact ? (
    <Link href={contact} className={buttonClasses()}>
      {t('contact')}
    </Link>
  ) : undefined;
  const place = posting.location ?? (posting.isRemote ? t('remoteLabel') : t('unknownLocation'));
  return (
    <article className="w-full min-w-0">
      <BackLink href="/ilanlar">{t('back')}</BackLink>
      <PageHeader eyebrow={t('eyebrow')} title={posting.title} actions={action}>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Badge tone={posting.daysLeft <= 7 ? 'accent' : 'info'}>
            {posting.daysLeft === 0 ? t('today') : t('daysLeft', { count: posting.daysLeft })}
          </Badge>
        </div>
      </PageHeader>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-10">
        <div className="flex min-w-0 max-w-[70ch] flex-col gap-6 lg:col-start-1 lg:row-start-1">
          {!!posting.matchTags?.length && (
            <section>
              <h2 className="font-semibold">{t('whyMatch')}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {posting.matchTags.map((tag) => (
                  <span
                    key={tag.slug}
                    className="rounded-full bg-primary-soft px-3 py-1 text-sm text-on-primary-soft"
                  >
                    {tag.label ??
                      (tag.slug in messages.profileTags
                        ? tagLabels(tag.slug as keyof typeof messages.profileTags)
                        : tag.slug)}
                  </span>
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="text-xl font-bold">{t('description')}</h2>
            <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed text-fg">
              {posting.description}
            </p>
          </section>
          {posting.applyMethod === 'CONTACT_REQUEST' && !canRequestContact && (
            <p className="text-fg-muted">{t('contactUnavailable')}</p>
          )}
          <ReportPosting postingId={posting.id} />
        </div>
        <aside
          aria-label={t('facts')}
          className="rounded-card border border-border bg-surface p-5 shadow-card max-lg:order-first lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1"
        >
          <dl className="grid gap-4">
            <div>
              <dt className="text-sm text-fg-muted">{t('company')}</dt>
              <dd className="break-words text-base font-semibold text-fg">
                {posting.companyId ? (
                  <Link
                    className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
                    href={`/sirketler/${posting.companyId}`}
                  >
                    {posting.organizationName}
                  </Link>
                ) : (
                  posting.organizationName
                )}
              </dd>
            </div>
            {posting.authorKind === 'STUDENT' && (
              <div>
                <dt className="text-sm text-fg-muted">{t('sharedBy')}</dt>
                <dd className="break-words text-base text-fg">
                  <SharedBy posting={posting} stacked />
                  <span className="mt-1 block text-sm text-fg-muted">{t('sharedNote')}</span>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-fg-muted">{t('kind')}</dt>
              <dd className="mt-1">
                <Badge tone="category">{t(posting.kind)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-fg-muted">{t('location')}</dt>
              <dd className="break-words text-base text-fg [overflow-wrap:anywhere]">
                {place}
                {posting.location && posting.isRemote && (
                  <>
                    {' · '}
                    {t('remoteLabel')}
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-fg-muted">{t('target')}</dt>
              <dd className="break-words text-base text-fg">
                {posting.targetDepartments.map((d) => d.name).join(', ')}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </article>
  );
}
