import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';

/**
 * Hız sınırı satırı, penceresinin başlangıcından bu kadar sonra silinir. Bilinen en uzun pencere 30 gündür
 * (`RATE_LIMITS.jobPostingSubmit`/`seekerContact`); bir gün de pay bırakılır. Süresi dolmuş satır zaten bir sonraki
 * istekte sıfırlanacağı için silmek sınırı gevşetmez, yalnız tablonun büyümesini durdurur (kart 531: her farklı
 * e-posta/adres bir satır açar ve satırlar hiç silinmiyordu). Sınır `auth-cleanup.db.test.ts` ile en uzun pencereye bağlanır.
 */
export const RATE_LIMIT_RETENTION_MS = 31 * 24 * 60 * 60 * 1000;

/** Kesim anı sabittir; silme sırasında süresi uzatılan kayıt yeniden kontrol edilir. */
export async function purgeExpiredAuth(db: PrismaClient, now = new Date(), batchSize = 500) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000)
    throw new Error('AUTH_CLEANUP_BATCH_INVALID');
  let sessions = 0;
  let verifications = 0;
  let rateLimits = 0;
  for (;;) {
    const rows = await db.session.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
    if (!rows.length) break;
    const result = await db.session.deleteMany({
      where: { id: { in: rows.map((row) => row.id) }, expiresAt: { lt: now } },
    });
    sessions += result.count;
  }
  for (;;) {
    const rows = await db.verification.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
    if (!rows.length) break;
    const result = await db.verification.deleteMany({
      where: { id: { in: rows.map((row) => row.id) }, expiresAt: { lt: now } },
    });
    verifications += result.count;
  }
  // Hız sınırı satırları: pencere başlangıcı (`lastRequest`, ms) en uzun pencereden ve payından eskiyse silinir.
  const cutoff = BigInt(now.getTime() - RATE_LIMIT_RETENTION_MS);
  for (;;) {
    const rows = await db.rateLimit.findMany({
      where: { lastRequest: { lt: cutoff } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
    if (!rows.length) break;
    const result = await db.rateLimit.deleteMany({
      where: { id: { in: rows.map((row) => row.id) }, lastRequest: { lt: cutoff } },
    });
    rateLimits += result.count;
    // Sayaç aynı anda yenilenip hiçbir satır silinemediyse (yarış) sonsuz döngüye girme.
    if (result.count === 0) break;
  }
  return { sessions, verifications, rateLimits };
}
