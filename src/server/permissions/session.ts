import 'server-only';

import { headers } from 'next/headers';

import { getAuth } from '../auth';
import { logAuthFailure } from '../auth/log';

/**
 * Oturumdaki kullanıcının kimliği — yetki katmanının TEK oturum bağlantı noktası (P1-01 sözleşmesi).
 * Better Auth veritabanı oturumunu çerezden çözer; çerez önbelleği kapalıdır (askı/silme anında etkili).
 *
 * FAIL-CLOSED: istek bağlamı yoksa, yapılandırma eksikse ya da çözümleme hata verirse `null` döner
 * (oturumsuz); hata türü günlüğe yazılır, ayrıntısı yazılmaz. Burada yalnız “kim” sorusu cevaplanır —
 * hesap durumu (askı/silinme) ve yetki `loadActor` + `rules/authorization` içindedir.
 */
export async function getSessionUserId(): Promise<string | null> {
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    return session?.user.id ?? null;
  } catch (error) {
    logAuthFailure('getSession', error);
    return null;
  }
}
