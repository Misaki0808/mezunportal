import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { ActionFailure } from '@/contracts/result';
import { actionFailure } from '@/lib/action-result';
import { REQUEST_PATH_HEADER, withReturnPath } from '@/lib/return-path';

import { logUnexpected, type UnexpectedContext } from './unexpected-log';

/** Girişe gidiş adresi: yalnız güvenli site içi dönüş yolu (`safeReturnPath`) eklenir; aksi halde düz `/giris`. */
export function signInPathFor(requestPath: string | null): string {
  return withReturnPath('/giris', requestPath);
}

/** İstek kimliği (varsa `x-request-id`) ve sunucu eylemi kimliği (`next-action`); istek kapsamı yoksa boş. */
async function requestContext(): Promise<UnexpectedContext> {
  try {
    const requestHeaders = await headers();
    return {
      requestId: requestHeaders.get('x-request-id'),
      actionId: requestHeaders.get('next-action'),
    };
  } catch {
    return {};
  }
}

/**
 * Sunucu eylemlerinin ortak hata çıkışı (tek yer). Kodlu hatayı `ActionFailure`'a çevirir; `AUTH_UNAUTHENTICATED` ise
 * (oturum düşmüş) kullanıcıyı `/giris?donus=<bulunduğu yol>` adresine yönlendirir: giriş sonrası aynı sayfaya dönülür.
 * Yol, `proxy.ts`'in yazdığı `x-mezun-path` başlığından gelir (istemci başlığı ezilir) ve `safeReturnPath`'ten geçer:
 * açık yönlendirme yoktur. İstek kapsamı yoksa (birim testi, betik) yönlendirme yapılmaz, hata değer olarak döner.
 *
 * `source` eylemin sabit adıdır (zorunlu: her çağrı kendini adlandırır). Beklenmedik (kodlu olmayan, doğrulama olmayan)
 * hata `SERVER_UNEXPECTED` olur ve ayrıca `action.unexpected` olayıyla TEK satır günlüğe yazılır (`unexpected-log.ts`:
 * eylem adı, hata sınıfı, varsa güvenli hata kodu, istek kimliği; ileti, yığın izi, girdi ve kişisel veri yok). Kodlu
 * hatalar sessiz kalır.
 */
export async function failAction(error: unknown, source: string): Promise<ActionFailure> {
  const failure = actionFailure(error);
  if (failure.errorCode === 'SERVER_UNEXPECTED') {
    logUnexpected('action', source, error, await requestContext());
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
