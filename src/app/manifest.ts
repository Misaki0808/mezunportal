import type { MetadataRoute } from 'next';
import { getTranslations } from 'next-intl/server';

// “Ana ekrana ekle” ile uygulama gibi açılır (docs/design.md). Renkler globals.css token'larıdır.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations({ locale: 'tr', namespace: 'metadata' });

  return {
    name: t('title'),
    short_name: t('title'),
    description: t('description'),
    lang: 'tr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fcfcfd',
    theme_color: '#5b5bf6',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
