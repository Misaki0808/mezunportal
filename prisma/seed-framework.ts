import { createHash } from 'node:crypto';
import type { PrismaClient } from '../src/generated/prisma/client';
import { seedInstitutions } from './seed-institutions';

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

// Hesap oluşturmaz, kimlik bilgisi içermez. Better Auth/kullanıcı modeli P1-02'de gelir.
export const TEST_ACCOUNT_PLACEHOLDERS = [
  'student',
  'seniorMentor',
  'alumniMentor',
  'academic',
  'departmentAdmin',
  'systemAdmin',
] as const;

// Yabancı anahtar sırası: kurumlar → hesaplar (P1-02) → özellik örnekleri (ilgili faz adımı).
export const SEED_MODULES = [{ name: 'institutions', run: seedInstitutions }] as const;

export async function runSeedModules(prisma: PrismaClient) {
  for (const seedModule of SEED_MODULES) await seedModule.run(prisma);
}
