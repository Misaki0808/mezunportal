import 'server-only';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_PATHS } from '@/contracts/auth';
import { REQUEST_PATH_HEADER, safeReturnPath, withReturnPath } from '@/lib/return-path';
import { getConsentState } from '@/server/actions/privacy';
import { ErrorState } from '@/components/ui';

/**
 * Oturum ve rıza kapısı (sunucu). Oturumsuz (çıkış yapmış, silinmiş hesap dahil) → giriş; zorunlu onayı
 * eksik → onay. İkisinde de gitmek istenen yol `?donus=` ile taşınır (yalnız site içi yol; tur #1, #10).
 */
export async function PrivacyGuard({ children }: { children: ReactNode }) {
  const result = await getConsentState();
  const requested = safeReturnPath((await headers()).get(REQUEST_PATH_HEADER));
  if (!result.ok) {
    if (result.errorCode === 'AUTH_UNAUTHENTICATED') {
      redirect(withReturnPath(AUTH_PATHS.signIn, requested));
    }
    return <ErrorState errorCode={result.errorCode} />;
  }
  if (result.data.blocking) redirect(withReturnPath('/onay', requested));
  return children;
}
