import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ErrorState, PageHeader } from '@/components/ui';
import { listCampusEvents } from '@/server/actions/campus-events';

export const dynamic = 'force-dynamic';
export default async function CampusEventsPage() {
  const [result, t] = await Promise.all([listCampusEvents(), getTranslations('campusEvents')]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader title={t('title')} description={t('description')} />
      {!result.data.length ? (
        <p className="mt-6 rounded-card border border-border p-5">{t('empty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {result.data.map((event) => (
            <li key={event.id}>
              <Link
                href={`/etkinlikler/${event.id}`}
                className="press-row block min-h-24 rounded-card border border-border bg-surface p-5 shadow-card"
              >
                <h2 className="text-lg font-semibold">{event.title}</h2>
                <p className="mt-2 text-fg-muted">
                  {new Intl.DateTimeFormat('tr-TR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Europe/Istanbul',
                  }).format(event.startsAt)}{' '}
                  · {event.location}
                </p>
                <span className="mt-3 block font-semibold text-primary">{t('details')} →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
