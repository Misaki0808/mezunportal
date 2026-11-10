import { createHash } from 'node:crypto';

/** Gerçek saat/rastgelelik kullanmaz; modeller geldikçe yeni seed'ler bunu paylaşır. */
export function seedId(namespace: string, key: string): string {
  return createHash('sha256')
    .update(JSON.stringify([namespace, key]))
    .digest('hex')
    .slice(0, 24);
}

/**
 * Deterministik UUID (sürüm 8 biçimi): kimliği `z.uuid()` ile doğrulayan çıktı şemalarına giren varlıklar (şirket, ilan, deneyim,
 * etkinlik) için. `seedId` 24 haneli onaltılıktır ve UUID değildir; mevcut seed satırları o biçimle yazıldığından değiştirilmez.
 */
export function seedUuid(namespace: string, key: string): string {
  const bytes = createHash('sha256')
    .update(JSON.stringify([namespace, key]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function seedTime(offsetMinutes = 0): Date {
  if (!Number.isSafeInteger(offsetMinutes)) throw new Error('Seed zaman farkı tam sayı olmalı.');
  return new Date(Date.UTC(2026, 0, 1) + offsetMinutes * 60_000);
}

/**
 * `seedId` ile aynı deterministik türetme, ama GEÇERLİ UUID biçiminde (sürüm 7, RFC değişkeni): sözleşmeler (`z.uuid()`) uygulamanın kendi
 * ürettiği kimlikleri bekler; 24 harfli onaltılık kimlik arayüze çıkınca doğrulamada düşer. Arayüze çıkan örnek kayıtlar bunu kullanır.
 */
export function seedUuid(namespace: string, key: string): string {
  const hex = createHash('sha256')
    .update(JSON.stringify([namespace, key]))
    .digest('hex');
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
