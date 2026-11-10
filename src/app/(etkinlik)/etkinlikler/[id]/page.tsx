import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ErrorState, PageHeader } from '@/components/ui';
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
    <main className="mx-auto max-w-2xl px-5 pb-56 pt-10 lg:pb-10">
      <Link
        href="/etkinlikler"
        className="inline-flex min-h-11 items-center text-primary underline"
      >
        ← {t('back')}
      </Link>
      <PageHeader title={event.title} description={event.location} />
      <p className="mt-5 font-semibold">
        {new Intl.DateTimeFormat('tr-TR', {
          dateStyle: 'long',
          timeStyle: 'short',
          timeZone: 'Europe/Istanbul',
        }).format(event.startsAt)}
      </p>
      <p className="mt-4 whitespace-pre-wrap">{event.description}</p>
      <a
        href={`/api/etkinlikler/${event.id}/ics`}
        className="mt-4 inline-flex min-h-11 items-center text-primary underline"
      >
        {t('calendar')}
      </a>
      <EventActions
        eventId={id}
        registered={event.registered}
        attended={event.attended}
        full={event.registeredCount >= event.capacity}
      />
    </main>
  );
}
