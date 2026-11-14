import { APPOINTMENT_ICS_CONTENT_TYPE } from '@/contracts/appointment';
import { isCodedError } from '@/lib/errors';
import { getDb } from '@/server/db';
import { createRecordingNotifier } from '@/server/services/appointment-notifier';
import { readRouteSession } from '@/server/permissions/route-session';
import { getAppointmentIcs } from '@/server/services/appointment';
import { logUnexpected } from '@/server/unexpected-log';

// Randevu `.ics`: yalnız iki katılımcıya, yalnız onaylı randevu için. Yetkisiz/olmayan/onaylı olmayan: ayırt edilmez (404).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const status = (code: number) =>
  new Response(null, { status: code, headers: { 'cache-control': 'no-store' } });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await readRouteSession('randevuIcs');
  if (!session.ok) return session.response;
  const userId = session.userId;
  try {
    // Okuma yolu bildirim ve takvim kullanmaz.
    const text = await getAppointmentIcs(
      { db: getDb(), calendar: null, notifier: createRecordingNotifier() },
      userId,
      { appointmentId: id },
    );
    return new Response(text, {
      status: 200,
      headers: {
        'content-type': APPOINTMENT_ICS_CONTENT_TYPE,
        'content-disposition': 'attachment; filename="randevu.ics"',
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (error) {
    if (isCodedError(error) && error.kind === 'unauthenticated') return status(401);
    logUnexpected('route', 'randevuIcs', error);
    return status(404);
  }
}
