import 'server-only';

import { getSessionCookie } from 'better-auth/cookies';
import { cache } from 'react';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';

import { getAuth } from '../auth';

/** Çerez kimlik veya yetki değildir; yalnız oturum çözümünü gereksiz yere başlatmamak içindir.
 * Geçersiz/sonlanmış oturumu Better Auth reddeder. Altyapı hatası fail-closed olarak çağırana aktarılır;
 * eylem veya ortak sayfa sınırı bunu güvenli, tek satırlık günlük ve geçici hataya çevirir.
 */
export const getSessionUserId = cache(async (): Promise<string | null> => {
  let requestHeaders: Awaited<ReturnType<typeof headers>>;
  try {
    requestHeaders = await headers();
  } catch (error) {
    unstable_rethrow(error);
    // İstek kapsamı olmayan betik/birim testi: okunacak çerez yok. Diğer hatalar gizlenmez.
    if (
      error instanceof Error &&
      error.message ===
        '`headers` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
      return null;
    throw error;
  }
  if (!getSessionCookie(requestHeaders, { cookiePrefix: 'mezun' })) return null;
  try {
    const session = await getAuth().api.getSession({ headers: requestHeaders });
    return session?.user?.id ?? null;
  } catch (error) {
    unstable_rethrow(error);
    throw error;
  }
});
