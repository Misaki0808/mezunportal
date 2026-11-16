import 'server-only';
import type { Prisma } from '@/generated/prisma/client';

/** Kullanıcı kilidi ALINDIKTAN sonra çağrılır. `now()` işlem başlangıcıdır, kilit sırası değildir.
 * Aynı milisaniye/saat gerilemesinde de son fotoğraf kararı kesinlikle daha yeni kalır. */
export async function nextPhotoConsentTime(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  userId: string,
): Promise<Date> {
  const [row] = await tx.$queryRaw<{ decidedAt: Date }[]>`
    SELECT GREATEST(clock_timestamp(),
      COALESCE(MAX("createdAt") + INTERVAL '1 millisecond', clock_timestamp())) AS "decidedAt"
    FROM "Consent" WHERE "userId"=${userId} AND "documentType"='PROFILE_PHOTO_VISIBILITY'`;
  if (!row) throw new Error('PHOTO_CONSENT_CLOCK_UNAVAILABLE');
  return row.decidedAt;
}
