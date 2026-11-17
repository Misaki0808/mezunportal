import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  CalendarIcon,
  ChevronRightIcon,
  EmptyState,
  ErrorState,
  MapPinIcon,
  PageHeader,
} from '@/components/ui';
import { listCampusEvents } from '@/server/actions/campus-events';

export const dynamic = 'force-dynamic';

const istanbul = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('tr-TR', { ...options, timeZone: 'Europe/Istanbul' }).format(date);

export default async function CampusEventsPage() {
  const [result, t] = await Promise.all([listCampusEvents(), getTranslations('campusEvents')]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <div className="w-full min-w-0">
      <PageHeader title={t('title')} description={t('description')} />
      {!result.data.length ? (
        <EmptyState
          className="mt-6 rounded-card border border-dashed border-border"
          icon={<CalendarIcon width={32} height={32} strokeWidth={1.5} />}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.data.map((event) => (
            <li key={event.id} className="min-w-0">
              <Link
                href={`/etkinlikler/${event.id}`}
                className="press-row flex h-full min-h-24 items-center gap-4 rounded-card border border-border bg-surface p-4 shadow-card sm:p-5"
              >
                <span
                  aria-hidden="true"
                  className="flex w-16 shrink-0 flex-col items-center rounded-control bg-primary-soft px-2 py-3 text-on-primary-soft"
                >
                  <span className="text-sm font-semibold uppercase">
                    {istanbul(event.startsAt, { month: 'short' })}
                  </span>
                  <span className="font-heading text-3xl font-extrabold">
                    {istanbul(event.startsAt, { day: 'numeric' })}
                  </span>
                  <span className="text-sm">{istanbul(event.startsAt, { weekday: 'short' })}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <h2 className="break-words text-lg font-semibold text-fg">{event.title}</h2>
                  <span className="mt-1 block text-fg-muted">
                    {istanbul(event.startsAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-fg-muted">
                    <MapPinIcon width={16} height={16} className="shrink-0" />
                    <span className="min-w-0 break-words">{event.location}</span>
                  </span>
                </span>
                <ChevronRightIcon className="shrink-0 text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
