import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AccountFrame } from '@/components/account/account-frame';
import { ErrorState } from '@/components/ui';
import { ReliabilityBadge } from '@/components/feedback/reliability-badge';
import { getFeedbackOverview } from '@/server/actions/feedback';
export const dynamic = 'force-dynamic';
export default async function FeedbackOverviewPage() {
  const [result, t] = await Promise.all([getFeedbackOverview(), getTranslations('feedback')]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <AccountFrame title={t('pendingTitle')} backLabel={t('back')} width="max-w-2xl">
      {result.data.length === 0 ? (
        <p className="text-base text-fg-muted">{t('pendingEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-card">
          {result.data.map((item) => (
            <li key={item.id} className="p-4 sm:p-5">
              <p className="font-semibold">{item.name}</p>
              {item.kind === 'REQUEST' && (
                <p className="mt-2 text-base text-fg-muted">{t('requestBadge')}</p>
              )}
              <p className="mt-2 text-base text-fg-muted">
                {new Intl.DateTimeFormat('tr-TR', {
                  dateStyle: 'long',
                  timeStyle: 'short',
                  timeZone: 'Europe/Istanbul',
                }).format(new Date(item.startsAt))}
              </p>
              {item.studentSummary && (
                <p className="mt-3 text-base text-fg-muted">
                  {t('studentSummary', {
                    total: item.studentSummary.total,
                    interested: item.studentSummary.interested,
                    prepared: t(
                      item.studentSummary.prepared ? 'preparedGenerally' : 'preparedMixed',
                    ),
                    punctual: t(
                      item.studentSummary.punctual ? 'punctualGenerally' : 'punctualMixed',
                    ),
                  })}
                </p>
              )}
              {item.kind === 'FEEDBACK' ? (
                <Link
                  className="mt-3 inline-flex min-h-11 items-center font-medium text-primary"
                  href={`/hesap/gorusme/${encodeURIComponent(item.id)}`}
                >
                  {t('open')} →
                </Link>
              ) : (
                item.reliability && (
                  <p className="mt-3 text-base">
                    {t('studentReliability')}:{' '}
                    <ReliabilityBadge
                      label={item.reliability.label}
                      text={t(item.reliability.label)}
                    />
                  </p>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </AccountFrame>
  );
}
