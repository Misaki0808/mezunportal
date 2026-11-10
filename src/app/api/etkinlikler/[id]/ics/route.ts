import { getDb } from '@/server/db';
import { getSessionUserId } from '@/server/permissions/session';
import { buildIcs } from '@/server/rules/ics';
import { listCampusEvents } from '@/server/services/campus-event';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return new Response(null, { status: 401, headers: { 'cache-control': 'no-store' } });
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
  } catch {
    return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
}
