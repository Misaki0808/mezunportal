import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';

/** Kesim anı sabittir; silme sırasında süresi uzatılan kayıt yeniden kontrol edilir. */
export async function purgeExpiredAuth(db: PrismaClient, now = new Date(), batchSize = 500) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000)
    throw new Error('AUTH_CLEANUP_BATCH_INVALID');
  let sessions = 0;
  let verifications = 0;
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
  return { sessions, verifications };
}
