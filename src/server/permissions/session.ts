import 'server-only';

import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';

import { getAuth } from '../auth';
import { logAuthFailure } from '../auth/log';

/**
 * Oturumdaki kullanıcının kimliği — yetki katmanının TEK oturum bağlantı noktası (P1-01 sözleşmesi).
 * Better Auth veritabanı oturumunu çerezden çözer; çerez önbelleği kapalıdır (askı/silme anında etkili).
 *
 * FAIL-CLOSED: gerçek yapılandırma ya da çözümleme hatasında `null` döner (oturumsuz); hata türü günlüğe
 * yazılır, ayrıntısı yazılmaz. Sayfa kapısı altyapı hatasını ayırmak için `propagateUnexpected` ister; bu durumda
 * günlük ve hata sonucu çağıran kapıya bırakılır. Next kontrol sinyalleri yeniden fırlatılır. Yalnız “kim” sorulur —
 * hesap durumu (askı/silinme) ve yetki `loadActor` + `rules/authorization` içindedir.
 */
export async function getSessionUserId(options?: {
  propagateUnexpected?: boolean;
}): Promise<string | null> {
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    return session?.user.id ?? null;
  } catch (error) {
    unstable_rethrow(error);
    if (options?.propagateUnexpected) throw error;
    logAuthFailure('getSession', error);
    return null;
  }
}
