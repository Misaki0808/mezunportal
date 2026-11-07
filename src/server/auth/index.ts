import 'server-only';

import { getAuthEnv } from '@/lib/env';

import { getDb } from '../db';
import { enqueueEmail } from '../jobs/email';
import { createAuth, type MezunAuth } from './config';
import { createAuthEmailPort, type AuthEmailPort } from './email-port';

export type { MezunAuth } from './config';

const globalForAuth = globalThis as unknown as {
  __mezunAuth?: MezunAuth;
  __mezunAuthEmail?: AuthEmailPort;
};

/** E-posta bağlantısı tek yerde: Giriş ve belge kararı aynı işlemli giden kutusunu kullanır. */
export function getAuthEmailPort(): AuthEmailPort {
  globalForAuth.__mezunAuthEmail ??= createAuthEmailPort(enqueueEmail);
  return globalForAuth.__mezunAuthEmail;
}

/**
 * Tembel tekil Better Auth örneği (import anında env okunmaz; HMR'a dayanır). Better Auth yapılandırması
 * YALNIZ `src/server/auth/`'tadır. E-posta `enqueueEmail` üzerinden giden kutusuna yazılır;
 * SMTP teslimi ayrı worker'dadır (gönderim hatasında giriş yanıtı yine nötr kalır).
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
