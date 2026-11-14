import 'server-only';

import type { MyAccountName, UpdateMyNameOutput } from '@/contracts/account-name';
import { isValidAccountName, normalizeAccountName } from '@/contracts/account-name';
import type { PrismaClient } from '@/generated/prisma/client';
import { codedNotFound, codedValidation } from '@/lib/errors';

import { recordAdminAction } from './audit';
import { RATE_LIMITS, consumeRateLimit } from './rateLimit';

export type AccountNameDeps = { db: PrismaClient; now?: () => Date };

/**
 * Hesap adı (kart 353). Kimlik yalnız çağıranın kullanıcı kimliğidir: başka kullanıcının adını değiştiren bir yol yoktur.
 * Ad sunucuda yeniden normalleştirilir ve doğrulanır (istemciye güvenilmez).
 */
export async function getMyAccountName(
  deps: AccountNameDeps,
  userId: string,
): Promise<MyAccountName> {
  const user = await deps.db.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) throw codedNotFound('RESOURCE_NOT_FOUND');
  return { name: user.name };
}

/**
 * Adı değiştirir ve `USER_NAME_CHANGE` işlem kaydını AYNI işlemde yazar. Kayda eski/yeni ad girmez (kişisel veri):
 * yalnız "ad değişti" olayı (eylemi yapan = hedef kullanıcı). Ad aynıysa hiçbir şey yazılmaz ve hız sınırı sayacı artmaz.
 * Saatte 10 değişiklik sınırı işlem kaydının şişirilmesini önler.
 *
 * Hesap silme ve belge yükleme ile AYNI kullanıcı satırı kilidini alır ve `deletedAt`'i işlemin içinde denetler: önceden
 * yetkilendirilmiş bir ad isteği silme işleminden sonra devam ederse hiçbir şey yazmaz (`RESOURCE_NOT_FOUND`); aksi halde
 * anonimleştirilmiş `User.name` gerçek ada geri dönerdi (K-09).
 */
export async function updateMyName(
  deps: AccountNameDeps,
  userId: string,
  rawName: string,
): Promise<UpdateMyNameOutput> {
  const name = normalizeAccountName(rawName);
  if (!isValidAccountName(name)) throw codedValidation('ACCOUNT_NAME_INVALID');
  const now = deps.now?.() ?? new Date();
  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { name: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (user.name === name) return { name, changed: false };
    await consumeRateLimit(tx, RATE_LIMITS.accountName, userId, now);
    await tx.user.update({ where: { id: userId }, data: { name } });
    await recordAdminAction(tx, {
      actor: { userId },
      action: 'USER_NAME_CHANGE',
      targetType: 'USER',
      targetId: userId,
    });
    return { name, changed: true };
  });
}
