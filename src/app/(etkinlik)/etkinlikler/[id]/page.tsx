import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  buttonClasses,
  CalendarIcon,
  Card,
  ChevronLeftIcon,
  ErrorState,
  IconChip,
  MapPinIcon,
  PageHeader,
} from '@/components/ui';
import { EventActions } from '@/components/campus-events/event-actions';
import { listCampusEvents } from '@/server/actions/campus-events';
export const dynamic = 'force-dynamic';
export default async function CampusEventPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, result, t] = await Promise.all([
    params,
    listCampusEvents(),
    getTranslations('campusEvents'),
  ]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const event = result.data.find((x) => x.id === id);
  if (!event) notFound();
  return (
    <div className="mx-auto max-w-2xl px-5 pb-56 pt-6 lg:pb-10">
      <Link href="/etkinlikler" className={buttonClasses({ variant: 'ghost' }) + ' -ml-4'}>
        <ChevronLeftIcon width={18} height={18} />
        {t('back')}
      </Link>
      <PageHeader title={event.title} className="mt-2" />
      <Card className="mt-6 space-y-4">
        <p className="flex items-center gap-3 font-semibold text-fg">
          <IconChip tone="primary">
            <CalendarIcon />
          </IconChip>
          {new Intl.DateTimeFormat('tr-TR', {
            dateStyle: 'long',
            timeStyle: 'short',
            timeZone: 'Europe/Istanbul',
          }).format(event.startsAt)}
        </p>
        <p className="flex items-center gap-3 text-fg">
          <IconChip tone="accent">
            <MapPinIcon />
          </IconChip>
          <span className="min-w-0 break-words">{event.location}</span>
        </p>
        <p className="whitespace-pre-wrap border-t border-border pt-4 leading-relaxed">
          {event.description}
        </p>
      </Card>
      <a
        href={`/api/etkinlikler/${event.id}/ics`}
        className={buttonClasses({ variant: 'secondary', fullWidth: true }) + ' mt-4'}
      >
        <CalendarIcon width={18} height={18} />
        {t('calendar')}
      </a>
      <EventActions
        eventId={id}
        registered={event.registered}
        attended={event.attended}
        full={event.registeredCount >= event.capacity}
      />
    </div>
  );
}
