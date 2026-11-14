import 'server-only';

import { unstable_rethrow } from 'next/navigation';
import { isCodedError, type ErrorCode } from '@/lib/errors';
import { logUnexpected } from '../unexpected-log';

/** Sayfa koruması: ret nedenini korur; mevcut durum ekranı doğru metin ve eylemi seçer. */
export async function guardPage<T>(
  source: string,
  guard: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; errorCode: ErrorCode }> {
  try {
    return { ok: true, value: await guard() };
  } catch (error) {
    unstable_rethrow(error);
    if (isCodedError(error)) return { ok: false, errorCode: error.code };
    logUnexpected('route', source, error);
    return { ok: false, errorCode: 'SERVER_UNEXPECTED' };
  }
}
