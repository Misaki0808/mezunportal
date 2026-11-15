import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { unstable_rethrow } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { getEnv } from '@/lib/env';
import { THEME_BROWSER_COLORS, THEME_COOKIE, parseTheme } from '@/lib/theme';
import { ToastProvider } from '@/components/ui';
import { SessionUnavailable } from '@/components/layout/session-unavailable';
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

/**
 * Tarayıcı çubuğu rengi görünüm tercihini izler (kart 383): elle seçimde seçilen temanın rengi, `system` iken cihazın
 * ayarına göre iki etiket. Çerez geçersizse `system`.
 */
export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return {
    width: 'device-width',
    initialScale: 1,
    // Çentikli telefonlarda alt gezinme güvenli alana saygı duyar (env(safe-area-inset-*))
    viewportFit: 'cover',
    themeColor:
      theme === 'system'
        ? [
            { media: '(prefers-color-scheme: light)', color: THEME_BROWSER_COLORS.light },
            { media: '(prefers-color-scheme: dark)', color: THEME_BROWSER_COLORS.dark },
          ]
        : THEME_BROWSER_COLORS[theme],
  };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale();
  // Görünüm tercihi çerezden; ilk boyamada doğru tema (yanıp sönme yok, betik gerekmez). Bozuk/boş çerez `system`.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  let sessionUnavailable = false;
  try {
    await getSessionUserId();
  } catch (error) {
    unstable_rethrow(error);
    logUnexpected('route', 'session.resolve', error);
    sessionUnavailable = true;
  }

  return (
    <html
      lang={locale}
      data-theme={theme}
      className={`${bodyFont.variable} ${headingFont.variable}`}
    >
      <body>
        <NextIntlClientProvider>
          <ToastProvider>
            {sessionUnavailable ? <SessionUnavailable /> : <AppShell>{children}</AppShell>}
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
