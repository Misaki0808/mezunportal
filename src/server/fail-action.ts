import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { ActionFailure } from '@/contracts/result';
import { actionFailure } from '@/lib/action-result';
import { REQUEST_PATH_HEADER, withReturnPath } from '@/lib/return-path';

import { logUnexpected } from './unexpected-log';

/** Girişe gidiş adresi: yalnız güvenli site içi dönüş yolu (`safeReturnPath`) eklenir; aksi halde düz `/giris`. */
export function signInPathFor(requestPath: string | null): string {
  return withReturnPath('/giris', requestPath);
}

/**
 * Sunucu eylemlerinin ortak hata çıkışı (tek yer). Kodlu hatayı `ActionFailure`'a çevirir; `AUTH_UNAUTHENTICATED` ise
 * (oturum düşmüş) kullanıcıyı `/giris?donus=<bulunduğu yol>` adresine yönlendirir: giriş sonrası aynı sayfaya dönülür.
 * Yol, `proxy.ts`'in yazdığı `x-mezun-path` başlığından gelir (istemci başlığı ezilir) ve `safeReturnPath`'ten geçer:
 * açık yönlendirme yoktur. İstek kapsamı yoksa (birim testi, betik) yönlendirme yapılmaz, hata değer olarak döner.
 *
 * `source` eylemin sabit adıdır (zorunlu: her çağrı kendini adlandırır). Beklenmedik (kodlu olmayan, doğrulama olmayan)
 * hata `SERVER_UNEXPECTED` olur ve ayrıca `action.unexpected` olayıyla TEK satır günlüğe yazılır (`unexpected-log.ts`:
 * eylem adı, hata sınıfı, varsa sabit izin listesinden hata kodu; ileti, yığın izi, girdi ve kişisel veri yok). Kodlu
 * hatalar sessiz kalır.
 */
export async function failAction(error: unknown, source: string): Promise<ActionFailure> {
  const failure = actionFailure(error);
  if (failure.errorCode === 'SERVER_UNEXPECTED') {
    logUnexpected('action', source, error);
  }
  if (failure.errorCode !== 'AUTH_UNAUTHENTICATED') return failure;
  let requestPath: string | null;
  try {
    requestPath = (await headers()).get(REQUEST_PATH_HEADER);
  } catch {
    return failure;
  }
  redirect(signInPathFor(requestPath));
}
