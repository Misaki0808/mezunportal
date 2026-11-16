import 'server-only';

import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import type { PrismaClient } from '@/generated/prisma/client';
import type { StorageAdapter } from '../external/storage';
import { eraseProfilePhoto } from './profile-photo-erasure';

/**
 * Rıza geri alındıktan sonra silinemeyen fotoğrafları yeniden dener. Kullanıcı kilidi,
 * rıza değişikliği ve yükleme ile aynıdır; karar ve dosya kilit altında yeniden okunur.
 */
export async function purgeProfilePhotos(db: PrismaClient, storage: StorageAdapter) {
  let after = '';
  let scanned = 0;
  let removed = 0;
  let failed = 0;
  for (;;) {
    const rows = await db.profilePhoto.findMany({
      where: { userId: { gt: after } },
      orderBy: { userId: 'asc' },
      take: 100,
      select: { userId: true },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      scanned++;
      try {
        const didRemove = await db.$transaction(async (tx) => {
          const [owner] = await tx.$queryRaw<{ deletedAt: Date | null }[]>`
            SELECT "deletedAt" FROM "User" WHERE "id"=${row.userId} FOR UPDATE`;
          if (!owner) return false;
          const photo = await tx.profilePhoto.findUnique({ where: { userId: row.userId } });
          if (!photo) return false;
          const consent = await tx.consent.findFirst({
            where: { userId: row.userId, documentType: 'PROFILE_PHOTO_VISIBILITY' },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { granted: true, version: true },
          });
          if (
            !owner.deletedAt &&
            consent?.granted &&
            consent.version === CURRENT_CONSENT_VERSIONS.PROFILE_PHOTO_VISIBILITY
          )
            return false;
          await eraseProfilePhoto(tx, storage, row.userId);
          return true;
        });
        if (didRemove) removed++;
      } catch {
        // Kısmi depolama silinmesi yinelenebilir; satır işlem geri alımıyla sonraki iş için kalır.
        failed++;
      }
    }
    after = rows[rows.length - 1]!.userId;
  }
  return { scanned, removed, failed };
}
