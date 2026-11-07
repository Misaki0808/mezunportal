import type { PrismaClient } from '../src/generated/prisma/client';
import { seedAccounts } from './seed-accounts';
import { seedInstitutions } from './seed-institutions';
import { seedProfileTags } from './seed-profile-tags';

export { seedId, seedTime } from './seed-util';

// Rol başına altı test kullanıcısının anahtarları (seed-accounts.ts bunlarla üretir). Kimlik bilgisi yoktur;
// test girişi ve Better Auth oturumları P1-02'de gelir.
export const TEST_ACCOUNT_PLACEHOLDERS = [
  'student',
  'seniorMentor',
  'alumniMentor',
  'academic',
  'departmentAdmin',
  'systemAdmin',
] as const;

// Yabancı anahtar sırası: kurumlar → hesaplar ve üyelikler (P1-01) → özellik örnekleri (ilgili faz adımı).
export const SEED_MODULES = [
  { name: 'institutions', run: seedInstitutions },
  { name: 'accounts', run: seedAccounts },
  { name: 'profileTags', run: seedProfileTags },
] as const;

export async function runSeedModules(prisma: PrismaClient) {
  for (const seedModule of SEED_MODULES) await seedModule.run(prisma);
}
