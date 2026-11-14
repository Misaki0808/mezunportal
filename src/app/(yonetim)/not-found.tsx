import { headers } from 'next/headers';
import { adminAccess } from '@/components/admin/access';
import { adminCapabilityFor } from '@/components/admin/path-capability';
import { metricsAccess } from '@/components/metrics/access';
import { ErrorState } from '@/components/ui';
import { REQUEST_PATH_HEADER } from '@/lib/return-path';

/** Yerleşimin 404'ü bu yolda isteyeni içeri alıyor mu? Hata ya da belirsizlikte alıyor sayılmaz (rol uyarısı). */
async function pathAllowed(segment: string | undefined) {
  try {
    if (segment === 'kullanim') return (await metricsAccess()).ok;
    return (await adminAccess(adminCapabilityFor(segment))).ok;
  } catch {
    return false;
  }
}

/**
 * Yönetim 404'ü. Yerleşim iki ayrı durumu aynı 404 ile verir: rolün yetmediği sayfa ve yetkili yöneticinin açtığı yabancı ya
 * da olmayan kayıt (yabancı = yok, K-07). Metni ayıran, aynı yolun yetkisinin yeniden denetlenmesidir: yetki varsa sayfa yok,
 * yoksa rol uyarısı. Kayıt ayrıntısı ya da kullanıcı bilgisi okunmaz; yabancı ve olmayan kayıt birebir aynı ekranı alır.
 */
export default async function AdminNotFound() {
  const requested = (await headers()).get(REQUEST_PATH_HEADER) ?? '/yonetim';
  const segment = requested.split('?')[0]!.split('/').filter(Boolean)[1];
  const allowed = await pathAllowed(segment);
  return <ErrorState errorCode={allowed ? 'RESOURCE_NOT_FOUND' : 'AUTH_FORBIDDEN'} />;
}
