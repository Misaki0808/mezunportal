import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ErrorState } from '@/components/ui';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { metricsAccess } from '@/components/metrics/access';
import { adminAccess } from '@/components/admin/access';
import { adminCapabilityFor } from '@/components/admin/path-capability';
import { REQUEST_PATH_HEADER } from '@/lib/return-path';
import { getUserDetail } from '@/server/actions/admin-users';

/** İzin reddi loading sınırının üstünde ölçülür; yanıt başlamadan gerçek 404 döner. Sayfa/eylem kontrolleri de korunur. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const requested = (await headers()).get(REQUEST_PATH_HEADER) ?? '/yonetim';
  const path = requested.split('?')[0]!.split('/').filter(Boolean);
  if (path[1] === 'kullanim') {
    const access = await metricsAccess();
    if (!access.ok) {
      if (
        [
          'AUTH_UNAUTHENTICATED',
          'AUTH_ACCOUNT_SUSPENDED',
          'AUTH_NOT_VERIFIED',
          'AUTH_FORBIDDEN',
          'CONSENT_REQUIRED',
        ].includes(access.errorCode)
      )
        notFound();
      return <ErrorState errorCode={access.errorCode} />;
    }
  }
  const guarded = await PrivacyGuard({ children });
  // Oturum/rıza yönlendirmeleri ve hesap hataları önceki kapıyla aynı kalır.
  if (guarded !== children) return guarded;

  const access = await adminAccess(adminCapabilityFor(path[1]));
  if (!access.ok) {
    if (access.errorCode === 'AUTH_FORBIDDEN') notFound();
    return <ErrorState errorCode={access.errorCode} />;
  }
  if (path[1] === 'kullanicilar' && path[2]) {
    let userId: string;
    try {
      userId = decodeURIComponent(path[2]);
    } catch {
      notFound();
    }
    const target = await getUserDetail({ userId });
    if (
      !target.ok &&
      ['AUTH_FORBIDDEN', 'RESOURCE_NOT_FOUND', 'VALIDATION_INVALID'].includes(target.errorCode)
    )
      notFound();
  }
  return guarded;
}
