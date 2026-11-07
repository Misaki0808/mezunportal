import { createHash } from 'node:crypto';

/** Gerçek saat/rastgelelik kullanmaz; modeller geldikçe yeni seed'ler bunu paylaşır. */
export function seedId(namespace: string, key: string): string {
  return createHash('sha256')
    .update(JSON.stringify([namespace, key]))
    .digest('hex')
    .slice(0, 24);
}

export function seedTime(offsetMinutes = 0): Date {
  if (!Number.isSafeInteger(offsetMinutes)) throw new Error('Seed zaman farkı tam sayı olmalı.');
  return new Date(Date.UTC(2026, 0, 1) + offsetMinutes * 60_000);
}
