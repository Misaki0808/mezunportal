import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { ToastProvider } from '@/components/ui';

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
  return { title: t('title'), description: t('description') };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Çentikli telefonlarda alt gezinme güvenli alana saygı duyar (env(safe-area-inset-*))
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#5b5bf6' },
    { media: '(prefers-color-scheme: dark)', color: '#14224a' },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body>
        <NextIntlClientProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
