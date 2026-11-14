import 'server-only';

import { unstable_rethrow } from 'next/navigation';
import { logUnexpected } from '../unexpected-log';
import { getSessionUserId } from './session';

/** Kimlik doğrulanmadan rota verisi açılmaz; altyapı hatası giriş yokmuş gibi sunulmaz. */
export async function readRouteSession(
  source: string,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  try {
    const userId = await getSessionUserId();
    return userId
      ? { ok: true, userId }
      : {
          ok: false,
          response: new Response(null, { status: 401, headers: { 'cache-control': 'no-store' } }),
        };
  } catch (error) {
    unstable_rethrow(error);
    logUnexpected('route', source, error);
    return {
      ok: false,
      response: new Response(null, {
        status: 503,
        headers: { 'cache-control': 'no-store', 'retry-after': '30' },
      }),
    };
  }
}
