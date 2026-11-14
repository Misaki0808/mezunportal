import 'server-only';
import { actionFailure, actionOk } from '@/lib/action-result';
import { logUnexpected } from '@/server/unexpected-log';
import { getDb } from '@/server/db';
import { requireAnyAdmin } from '@/server/permissions';
import { requireConsent } from '@/server/services/privacy';
/** Rapor yolunda erişim reddi loading/yeniden onay yönlendirmesinden önce 404 olur. Veriyi servis tekrar denetler. */
export async function metricsAccess() {
  try {
    const actor = await requireAnyAdmin();
    await requireConsent(getDb(), actor.userId);
    return actionOk(null);
  } catch (error) {
    logUnexpected('route', 'metricsAccess', error);
    return actionFailure(error);
  }
}
