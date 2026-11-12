import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  CalendarIcon,
  ChevronRightIcon,
  EmptyState,
  ErrorState,
  IconChip,
  MapPinIcon,
  PageHeader,
} from '@/components/ui';
import type { IconChipTone } from '@/components/ui';
import { listCampusEvents } from '@/server/actions/campus-events';

export const dynamic = 'force-dynamic';

/** Simge çipleri sırayla İris, Mercan, Nane (docs/design.md "Renk dağılımı"). */
const TONES: IconChipTone[] = ['primary', 'accent', 'success'];

export default async function CampusEventsPage() {
  const [result, t] = await Promise.all([listCampusEvents(), getTranslations('campusEvents')]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader title={t('title')} description={t('description')} />
      {!result.data.length ? (
        <EmptyState
          className="mt-6 rounded-card border border-dashed border-border"
          icon={<CalendarIcon width={32} height={32} strokeWidth={1.5} />}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      ) : (
        <ul className="mt-6 space-y-3">
          {result.data.map((event, index) => (
            <li key={event.id}>
              <Link
                href={`/etkinlikler/${event.id}`}
                className="press-row flex min-h-24 items-center gap-4 rounded-card border border-border bg-bg p-4 shadow-card sm:p-5"
              >
                <IconChip tone={TONES[index % TONES.length]}>
                  <CalendarIcon />
                </IconChip>
                <span className="min-w-0 flex-1">
                  <h2 className="break-words text-lg font-semibold text-fg">{event.title}</h2>
                  <span className="mt-1 block text-fg-muted">
                    {new Intl.DateTimeFormat('tr-TR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Europe/Istanbul',
                    }).format(event.startsAt)}
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
