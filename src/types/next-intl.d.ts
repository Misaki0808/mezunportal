import type messages from '../../messages/tr.json';

// Tek dil `tr`: anahtarlar tip düzeyinde denetlenir (yanlış anahtar derlemede kırmızı).
declare module 'next-intl' {
  interface AppConfig {
    Locale: 'tr';
    Messages: typeof messages;
  }
}
