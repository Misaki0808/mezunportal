import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/ui';
import { ReliabilityBadge } from '@/components/feedback/reliability-badge';
import { getFeedbackOverview } from '@/server/actions/feedback';
export const dynamic = 'force-dynamic';
export default async function FeedbackOverviewPage() {
  const [result, t] = await Promise.all([getFeedbackOverview(), getTranslations('feedback')]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link className="inline-flex min-h-11 items-center text-primary" href="/hesap">
        ← {t('back')}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">{t('pendingTitle')}</h1>
      {result.data.length === 0 ? (
        <p className="mt-6 text-base text-fg-muted">{t('pendingEmpty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {result.data.map((item) => (
            <li key={item.id} className="rounded-card border border-border p-5">
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
    </div>
  );
}
