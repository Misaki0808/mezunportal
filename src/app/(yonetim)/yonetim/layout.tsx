import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ErrorState } from '@/components/ui';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { adminAccess } from '@/components/admin/access';
import type { AdminOverview } from '@/contracts/admin';
import { REQUEST_PATH_HEADER } from '@/lib/return-path';
import { getUserDetail } from '@/server/actions/admin-users';

const capabilities: Record<string, keyof AdminOverview['capabilities']> = {
  sozlukler: 'dictionaries',
  eslesmeyenler: 'unmatchedValues',
  yetkiler: 'adminGrants',
  'islem-kaydi': 'auditLog',
  istihdam: 'employmentReport',
  sikayetler: 'reports',
};

/** İzin reddi loading sınırının üstünde ölçülür; yanıt başlamadan gerçek 404 döner. Sayfa/eylem kontrolleri de korunur. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const guarded = await PrivacyGuard({ children });
  // Oturum/rıza yönlendirmeleri ve hesap hataları önceki kapıyla aynı kalır.
  if (guarded !== children) return guarded;
  const requested = (await headers()).get(REQUEST_PATH_HEADER) ?? '/yonetim';
  const path = requested.split('?')[0]!.split('/').filter(Boolean);
  const access = await adminAccess(capabilities[path[1] ?? ''] ?? 'users');
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
