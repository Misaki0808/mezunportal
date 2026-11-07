import 'server-only';

import type { DeleteAccountOutput } from '@/contracts/privacy';
import type { PrismaClient } from '@/generated/prisma/client';
import { codedNotFound, codedValidation } from '@/lib/errors';

import { RATE_LIMITS, consumeRateLimit } from './rateLimit';

/**
 * Hesap silme (P1-03, K-09). Kullanıcı satırı SİLİNMEZ, anonimleştirilir: rıza ve işlem kaydı hukuki
 * kanıttır ve kullanıcıya bağlı kalır (Consent yalnız eklenir). Tek işlemde: kişisel alanlar boşalır,
 * e-posta geri dönüşsüz bir yer tutucuya döner (eski e-postayla bu hesaba giriş yok), oturumlar ve sağlayıcı
 * bağlantıları silinir, açık iletişim talepleri kapanır, görünürlük ayarları, üyelikler, mentor profili ve
 * yönetici yetkileri sonlanır, bekleyen belgeler silinir. Dosyalar işlem commit edilmeden silinir; dosya silme
 * bağlanmamışken silinecek dosya varsa işlem hiç başlamaz (yarım silme yok).
 */

export const DELETED_USER_NAME = 'Silinmiş kullanıcı';
export const deletedEmailFor = (userId: string) => `deleted-${userId}@deleted.invalid`;

export type PublishedContentChoice = 'DELETE' | 'ANONYMIZE';

/**
 * Yayınlanmış içerik işleyicileri (K-09). Deneyim (P1-07), SSS cevabı (P1-12) gibi adımlar burada kendi
 * işleyicisini kaydeder; şu an yayınlanabilen içerik yoktur.
 */
export type PublishedContentHandler = (
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  userId: string,
  choice: PublishedContentChoice,
) => Promise<void>;
export const PUBLISHED_CONTENT_HANDLERS: PublishedContentHandler[] = [];

export type AccountDeletionDeps = {
  /** Depolamadan dosya siler (idempotent: olmayan dosya hata değildir). Bağlı değilse `null`. */
  removeStoredFiles: ((keys: readonly string[]) => Promise<void>) | null;
  handlers?: readonly PublishedContentHandler[];
};

export async function deleteAccount(
  db: PrismaClient,
  userId: string,
  input: { publishedContent: PublishedContentChoice; confirmEmail: string },
  deps: AccountDeletionDeps,
  now: Date = new Date(),
): Promise<DeleteAccountOutput> {
  await consumeRateLimit(db, RATE_LIMITS.accountDeletion, userId, now);
  await db.$transaction(async (tx) => {
    // Yükleme de aynı satırı kilitler; eski bir oturumla başlayan yükleme silmeyle yarışamaz.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { email: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (user.email.toLowerCase() !== input.confirmEmail.toLowerCase()) {
      throw codedValidation('ACCOUNT_DELETE_CONFIRMATION_MISMATCH');
    }
    await tx.user.update({ where: { id: userId }, data: { deletedAt: now } });
    for (const handler of deps.handlers ?? PUBLISHED_CONTENT_HANDLERS) {
      await handler(tx, userId, input.publishedContent);
    }
    const pendingFiles = await tx.graduationDocument.findMany({
      where: { userId, status: 'PENDING' },
      select: { storageKey: true },
    });
    const fileKeys = pendingFiles
      .map((row) => row.storageKey)
      .filter((key): key is string => key !== null);
    if (fileKeys.length > 0 && !deps.removeStoredFiles) {
      throw new Error('Dosya silme bağlı değil; hesap silme başlatılmadı');
    }
    await tx.graduationDocument.deleteMany({ where: { userId, status: 'PENDING' } });

    // Açık iletişim talepleri kapanır; kapalı satırlar geçmiş olarak kalır (karşı tarafın kutusunda).
    await tx.contactRequest.updateMany({
      where: { targetId: userId, status: 'PENDING' },
      data: { status: 'REJECTED', decidedAt: now },
    });
    await tx.contactRequest.updateMany({
      where: { requesterId: userId, status: 'PENDING' },
      data: { status: 'WITHDRAWN', closedAt: now },
    });
    await tx.contactRequest.updateMany({
      where: { OR: [{ targetId: userId }, { requesterId: userId }], status: 'APPROVED' },
      data: { status: 'REVOKED', closedAt: now },
    });

    // Profil yayınlanmış içerik değildir: K-09'un her iki seçiminde de kişisel veri silinir.
    // ProfileTag ilişkileri ON DELETE CASCADE; ortak etiket sözlüğü korunur.
    await tx.profile.deleteMany({ where: { userId } });
    await tx.fieldVisibility.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.membership.updateMany({ where: { userId, endedAt: null }, data: { endedAt: now } });
    await tx.mentorProfile.updateMany({
      where: { userId },
      data: { isActive: false, inPersonNote: null },
    });
    await tx.adminGrant.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokedById: userId },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        name: DELETED_USER_NAME,
        email: deletedEmailFor(userId),
        emailVerified: false,
        image: null,
        phone: null,
        lastSeenAt: null,
        deletedAt: now,
      },
    });
    // Hata durumunda belge anahtarları ve hesap transaction ile korunur; yeniden denenebilir.
    // Depolama idempotenttir: kısmen silinen dosyalar yeniden silinebilir.
    if (fileKeys.length > 0 && deps.removeStoredFiles) await deps.removeStoredFiles(fileKeys);
  });
  // Kilitli yükleme yolu sonrasında kalmış kayıtlı anahtar varsa tekrar temizle.
  const remaining = await db.graduationDocument.findMany({
    where: { userId, storageKey: { not: null } },
    select: { storageKey: true },
  });
  const remainingKeys = remaining
    .map((row) => row.storageKey)
    .filter((key): key is string => key !== null);
  if (remainingKeys.length > 0) {
    if (!deps.removeStoredFiles) throw new Error('Dosya silme bağlı değil');
    await deps.removeStoredFiles(remainingKeys);
  }
  return { deleted: true };
}
