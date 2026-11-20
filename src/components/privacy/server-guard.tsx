import 'server-only';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_PATHS } from '@/contracts/auth';
import { REQUEST_PATH_HEADER, safeReturnPath, withReturnPath } from '@/lib/return-path';
import { getConsentState } from '@/server/actions/privacy';
import { ErrorState, Card } from '@/components/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

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
    const path = requested?.split('?', 1)[0]?.replace(/\/$/, '');
    if (
      result.errorCode === 'AUTH_ACCOUNT_SUSPENDED' &&
      (path === '/hesap/veriler' || path === '/hesap/hesabi-sil')
    ) {
      const t = await getTranslations('privacyScreens.suspendedRights');
      return (
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          <Card className="space-y-4">
            <h1 className="text-2xl font-semibold">{t('title')}</h1>
            <p>{t('description')}</p>
            <Link
              className="inline-flex min-h-11 items-center text-primary underline"
              href="/hukuki/aydinlatma"
            >
              {t('link')}
            </Link>
          </Card>
        </div>
      );
    }
    return <ErrorState errorCode={result.errorCode} />;
  }
  const ownRightsPaths = ['/hesap/gizlilik', '/hesap/veriler', '/hesap/hesabi-sil'];
  const path = requested?.split('?', 1)[0]?.replace(/\/$/, '');
  if (result.data.blocking && (!path || !ownRightsPaths.includes(path)))
    redirect(withReturnPath('/onay', requested));
  return children;
}
