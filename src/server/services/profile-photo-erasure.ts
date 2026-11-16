import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import type { StorageAdapter } from '../external/storage';

/** Kullanıcı kilidi çağıranda: yükleme, rıza ve hesap silme AYNI kilidi alır. */
export async function eraseProfilePhoto(
  tx: Pick<Prisma.TransactionClient, 'profilePhoto'>,
  storage: StorageAdapter,
  userId: string,
) {
  const photo = await tx.profilePhoto.findUnique({
    where: { userId },
    select: { largeKey: true, smallKey: true },
  });
  if (!photo) return;
  await storage.delete(photo.largeKey);
  await storage.delete(photo.smallKey);
  await tx.profilePhoto.delete({ where: { userId } });
}
