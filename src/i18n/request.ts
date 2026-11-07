import { getRequestConfig } from 'next-intl/server';

// Tek dil: Türkçe. URL'de dil öneki yok; dil seçimi ve yönlendirme kurulmaz.
export default getRequestConfig(async () => ({
  locale: 'tr',
  timeZone: 'Europe/Istanbul',
  messages: (await import('../../messages/tr.json')).default,
}));
