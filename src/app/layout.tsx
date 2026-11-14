import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { unstable_rethrow } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { getEnv } from '@/lib/env';
import { ErrorState, ToastProvider } from '@/components/ui';
import { getSessionUserId } from '@/server/permissions/session';
import { logUnexpected } from '@/server/unexpected-log';

import './globals.css';

// Kendinden barındırılan yazı tipleri (derlemede indirilir; çalışma anında Google'a istek yok). latin-ext = Türkçe harfler.
const bodyFont = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});
const headingFont = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-jakarta',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: t('title'),
    description: t('description'),
    metadataBase: new URL(getEnv().APP_URL),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Çentikli telefonlarda alt gezinme güvenli alana saygı duyar (env(safe-area-inset-*))
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#5b5bf6' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1a38' },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale();
  let sessionUnavailable = false;
  try {
    await getSessionUserId();
  } catch (error) {
    unstable_rethrow(error);
    logUnexpected('route', 'session.resolve', error);
    sessionUnavailable = true;
  }

  return (
    <html lang={locale} className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body>
        <NextIntlClientProvider>
          <ToastProvider>
            {sessionUnavailable ? (
              <main>
                <ErrorState errorCode="SERVER_UNEXPECTED" />
              </main>
            ) : (
              <AppShell>{children}</AppShell>
            )}
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
