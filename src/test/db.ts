import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/generated/prisma/client';
import { PRISMA_OMIT } from '@/lib/prisma-options';

/** Yalnız veritabanlı testler: `DATABASE_URL_TEST`'e bağlı Prisma istemcisi. Çağıran `$disconnect` eder. */
export function createTestPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL_TEST;
  if (!connectionString) {
    throw new Error('DATABASE_URL_TEST tanımlı değil');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }), omit: PRISMA_OMIT });
}
