import 'server-only';

import { getAuthEnv } from '@/lib/env';

import { getDb } from '../db';
import { createAuth, type MezunAuth } from './config';
import { createAuthEmailPort, notConfiguredEnqueue, type AuthEmailPort } from './email-port';

export type { MezunAuth } from './config';

const globalForAuth = globalThis as unknown as {
  __mezunAuth?: MezunAuth;
  __mezunAuthEmail?: AuthEmailPort;
};

/** E-posta bağlantısı tek yerde: R2'nin kuyruğu birleşince yalnız bu işlev değişir. */
export function getAuthEmailPort(): AuthEmailPort {
  globalForAuth.__mezunAuthEmail ??= createAuthEmailPort(notConfiguredEnqueue);
  return globalForAuth.__mezunAuthEmail;
}

/**
 * Tembel tekil Better Auth örneği (import anında env okunmaz; HMR'a dayanır). Better Auth yapılandırması
 * YALNIZ `src/server/auth/`'tadır. E-posta, R2'nin kuyruğu (`enqueueEmail`, kart 022) birleşince buraya
 * bağlanır; o zamana kadar `notConfiguredEnqueue` (gönderim hata verir, giriş yanıtı yine nötr kalır).
 */
export function getAuth(): MezunAuth {
  if (!globalForAuth.__mezunAuth) {
    globalForAuth.__mezunAuth = createAuth({
      db: getDb(),
      env: getAuthEnv(),
      email: getAuthEmailPort(),
      nextCookies: true,
    });
  }
  return globalForAuth.__mezunAuth;
}
