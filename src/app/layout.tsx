import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { ToastProvider } from '@/components/ui';

import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return { title: t('title'), description: t('description') };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Çentikli telefonlarda alt gezinme güvenli alana saygı duyar (env(safe-area-inset-*))
  viewportFit: 'cover',
  themeColor: '#1d4ed8',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
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
