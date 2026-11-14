import 'server-only';

import { unstable_rethrow } from 'next/navigation';
import { isCodedError, type ErrorCode } from '@/lib/errors';
import { logUnexpected } from '../unexpected-log';

/** Sayfa koruması: Next sinyalini korur, yetki reddi ile beklenmedik arızayı ayırır. */
export async function guardPage<T>(
  source: string,
  guard: () => Promise<T>,
  denied: ErrorCode = 'AUTH_FORBIDDEN',
): Promise<{ ok: true; value: T } | { ok: false; errorCode: ErrorCode }> {
  try {
    return { ok: true, value: await guard() };
  } catch (error) {
    unstable_rethrow(error);
    if (isCodedError(error)) return { ok: false, errorCode: denied };
    logUnexpected('route', source, error);
    return { ok: false, errorCode: 'SERVER_UNEXPECTED' };
  }
}
