import { getDb } from '@/server/db';
import { readRouteSession } from '@/server/permissions/route-session';
import { buildIcs } from '@/server/rules/ics';
import { listCampusEvents } from '@/server/services/campus-event';
import { logUnexpected } from '@/server/unexpected-log';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readRouteSession('etkinlikIcs');
  if (!session.ok) return session.response;
  const userId = session.userId;
  try {
    const { id } = await context.params;
    const event = (await listCampusEvents({ db: getDb() }, userId)).find((x) => x.id === id);
    if (!event) return new Response(null, { status: 404 });
    const text = buildIcs({
      uid: event.id,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      summary: event.title,
      description: event.description,
      location: event.location,
      now: new Date(),
    });
    return new Response(text, {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'attachment; filename="etkinlik.ics"',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    logUnexpected('route', 'etkinlikIcs', error);
    return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
}
