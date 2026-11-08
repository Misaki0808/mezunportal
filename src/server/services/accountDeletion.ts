import 'server-only';

import type { DeleteAccountOutput } from '@/contracts/privacy';
import type { PrismaClient } from '@/generated/prisma/client';
import { codedNotFound, codedValidation } from '@/lib/errors';

import { pruneOrphanSkillTags } from './profile-skills';
import { RATE_LIMITS, consumeRateLimit } from './rateLimit';
import { eraseExperienceContent } from './experiencePrivacy';

/**
 * Hesap silme (P1-03, K-09). Kullanıcı satırı SİLİNMEZ, anonimleştirilir: rıza ve işlem kaydı hukuki
 * kanıttır ve kullanıcıya bağlı kalır (Consent yalnız eklenir). Tek işlemde: kişisel alanlar boşalır,
 * e-posta geri dönüşsüz bir yer tutucuya döner (eski e-postayla bu hesaba giriş yok), oturumlar ve sağlayıcı
 * bağlantıları silinir, açık iletişim talepleri kapanır, görünürlük ayarları, üyelikler, mentor profili ve
 * yönetici yetkileri sonlanır, bekleyen belgeler silinir. Dosyalar işlem commit edilmeden silinir; dosya silme
 * bağlanmamışken silinecek dosya varsa işlem hiç başlamaz (yarım silme yok). CV yüklemeleri, ayrıştırma çıktısı ve
 * profil kalemleri (eğitim, pozisyon, dil, sertifika, beceri, staj davetleri) de aynı işlemde silinir (P1-05).
 */

export const DELETED_USER_NAME = 'Silinmiş kullanıcı';
export const deletedEmailFor = (userId: string) => `deleted-${userId}@deleted.invalid`;

export type PublishedContentChoice = 'DELETE' | 'ANONYMIZE';

/**
 * Yayınlanmış içerik işleyicileri (K-09). Deneyim (P1-07), SSS cevabı (P1-12) gibi adımlar burada kendi
 * işleyicisini kaydeder; yayınlanmamış kişisel içerik her iki seçimde de silinir.
 */
export type PublishedContentHandler = (
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  userId: string,
  choice: PublishedContentChoice,
) => Promise<void>;
export const PUBLISHED_CONTENT_HANDLERS: PublishedContentHandler[] = [eraseExperienceContent];

export type AccountDeletionDeps = {
  /** Depolamadan dosya siler (idempotent: olmayan dosya hata değildir). Bağlı değilse `null`. */
  removeStoredFiles: ((keys: readonly string[]) => Promise<void>) | null;
  /** Ek işleyiciler; zorunlu kişisel veri temizliğinin yerine geçmez. */
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
    for (const handler of [...PUBLISHED_CONTENT_HANDLERS, ...(deps.handlers ?? [])]) {
      await handler(tx, userId, input.publishedContent);
    }
    const pendingFiles = await tx.graduationDocument.findMany({
      where: { userId, status: 'PENDING' },
      select: { storageKey: true },
    });
    // CV dosyaları (P1-05): yüklemeler, ayrıştırma çıktısı ve CV'den gelen profil kalemleri kişiye aittir;
    // hesap silmede hepsi silinir (işlemdeki ayrıştırma işi satırı bulamaz ve atlanır).
    const cvFiles = await tx.cvUpload.findMany({
      where: { userId, storageKey: { not: null } },
      select: { storageKey: true },
    });
    const fileKeys = [...pendingFiles, ...cvFiles]
      .map((row) => row.storageKey)
      .filter((key): key is string => key !== null);
    if (fileKeys.length > 0 && !deps.removeStoredFiles) {
      throw new Error('Dosya silme bağlı değil; hesap silme başlatılmadı');
    }
    await tx.graduationDocument.deleteMany({ where: { userId, status: 'PENDING' } });
    await tx.experienceInvitation.deleteMany({ where: { userId } });
    await tx.position.deleteMany({ where: { userId } });
    await tx.education.deleteMany({ where: { userId } });
    await tx.language.deleteMany({ where: { userId } });
    await tx.certification.deleteMany({ where: { userId } });
    await tx.userSkill.deleteMany({ where: { userId } }); // eski tablo (TD-013)
    await tx.cvUpload.deleteMany({ where: { userId } });

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

    // Randevular (P1-10): açık olanlar sistem tarafından iptal edilir (takvim etkinliği süpürmede silinir); kişiye ait
    // serbest metin (öğrenci notu, yer notu, görüşme bağlantısı, ret notu) temizlenir. Satır, karşı tarafın geçmişi için kalır.
    await tx.appointment.updateMany({
      where: {
        status: { in: ['REQUESTED', 'CONFIRMED'] },
        OR: [{ mentorId: userId }, { menteeId: userId }],
      },
      data: {
        status: 'CANCELLED',
        cancelledBySystem: true,
        cancelledById: null,
        cancelReason: null,
      },
    });
    await tx.appointment.updateMany({
      where: { cancelledById: userId },
      data: { cancelReason: null },
    });
    await tx.appointment.updateMany({ where: { menteeId: userId }, data: { menteeNote: null } });
    await tx.appointment.updateMany({
      where: { mentorId: userId },
      data: { location: null, meetUrl: null, decisionNote: null },
    });
    await tx.availabilityRule.deleteMany({ where: { mentorId: userId } });

    // Profil yayınlanmış içerik değildir: K-09'un her iki seçiminde de kişisel veri silinir.
    // ProfileTag ilişkileri ON DELETE CASCADE; ortak etiket sözlüğü korunur.
    await tx.profile.deleteMany({ where: { userId } });
    // Serbest metin (kişisel) beceri etiketi hiçbir profile bağlı kalmadıysa geride bırakılmaz.
    await pruneOrphanSkillTags(tx);
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
