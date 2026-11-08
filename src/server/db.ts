import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';

import { getEnv } from '@/lib/env';
import { PRISMA_OMIT } from '@/lib/prisma-options';
import { PrismaClient } from '@/generated/prisma/client';

// Prisma 7: istemci driver adapter ile kurulur. `pg` bağlantı zaman aşımı varsayılanı Prisma 6'dan
// farklıdır (süresiz bekler); havuz ayarı açıkça verilir.
const POOL_OPTIONS = {
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
} as const;

const globalForDb = globalThis as unknown as { __mezunPrisma?: PrismaClient };

/** Tembel tekil istemci: import anında env okunmaz (derleme env'siz de geçer); geliştirmede HMR'a dayanır. */
export function getDb(): PrismaClient {
  if (!globalForDb.__mezunPrisma) {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL, ...POOL_OPTIONS });
    globalForDb.__mezunPrisma = new PrismaClient({ adapter, omit: PRISMA_OMIT });
  }
  return globalForDb.__mezunPrisma;
}

/**
 * Veritabanı ulaşılabilir mi? Yalnız doğru/yanlış döner; hata ayrıntısı (adres, kimlik bilgisi)
 * çağırana ve loga sızmaz — günlüğe yalnız hata türü yazılır.
 */
export async function pingDatabase(timeoutMs = 2_000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });
    await Promise.race([getDb().$queryRaw`SELECT 1`, timeout]);
    return true;
  } catch (error) {
    console.error('db ping başarısız', { type: error instanceof Error ? error.name : 'unknown' });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
