import 'server-only';

import type { DeleteAccountOutput } from '@/contracts/privacy';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
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
    await tx.alumniCourseMark.deleteMany({ where: { userId } });
    await tx.position.deleteMany({ where: { userId } });
    await tx.education.deleteMany({ where: { userId } });
    await tx.language.deleteMany({ where: { userId } });
    await tx.certification.deleteMany({ where: { userId } });
    await tx.userSkill.deleteMany({ where: { userId } }); // eski tablo (TD-013)
    // Öğrencinin CV ilişkileri ve her iki tarafın kişisel serbest metni hesap silmeyle kalkar.
    await tx.cvReviewRequest.deleteMany({ where: { studentId: userId } });
    const mentorRequests = await tx.cvReviewRequest.findMany({
      where: { mentorId: userId, status: 'OPEN' },
      select: { studentId: true, cvUploadId: true },
    });
    const otherStudents = [...new Set(mentorRequests.map((row) => row.studentId))].sort();
    if (otherStudents.length) {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(otherStudents)}) ORDER BY "id" FOR UPDATE`;
    }
    await tx.cvReviewRequest.updateMany({
      where: { mentorId: userId },
      data: { comment: null },
    });
    await tx.cvReviewRequest.updateMany({
      where: { mentorId: userId, status: 'OPEN' },
      data: { status: 'EXPIRED' },
    });
    for (const row of mentorRequests) {
      const open = await tx.cvReviewRequest.count({
        where: { cvUploadId: row.cvUploadId, status: 'OPEN' },
      });
      if (open) continue;
      const latest = await tx.cvUpload.findFirst({
        where: { userId: row.studentId, status: 'APPLIED' },
        orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      if (latest?.id === row.cvUploadId) continue;
      const upload = await tx.cvUpload.findUnique({
        where: { id: row.cvUploadId },
        select: { storageKey: true },
      });
      if (!upload?.storageKey) continue;
      if (!deps.removeStoredFiles)
        throw new Error('Dosya silme bağlı değil; hesap silme başlatılmadı');
      fileKeys.push(upload.storageKey);
      await tx.cvUpload.update({ where: { id: row.cvUploadId }, data: { storageKey: null } });
    }
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

    // SSS (P1-17): yayınlanmamış talepler (cevaplarıyla) silinir; yayınlanmışta soran bağı kopar. Yazdığı cevaplar silinir,
    // yayında seçilmiş cevap kimliksiz kalır. Yayınlanan SSS kimlik taşımadığı için olduğu gibi kalır.
    await tx.faqRequest.deleteMany({ where: { askerId: userId, status: { not: 'PUBLISHED' } } });
    await tx.faqRequest.updateMany({ where: { askerId: userId }, data: { askerId: null } });
    await tx.faqAnswer.deleteMany({ where: { mentorId: userId, isSelected: false } });
    await tx.faqAnswer.updateMany({ where: { mentorId: userId }, data: { mentorId: null } });
    await tx.faqRequest.updateMany({ where: { decidedById: userId }, data: { decidedById: null } });
    await tx.faqItem.updateMany({
      where: { publishedById: userId },
      data: { publishedById: null },
    });

    // Referans beyanı ve notları katılımcı silindiğinde kaldırılır; bekleyen puan kesinleşemez.
    const referralIds = (
      await tx.referralClaim.findMany({
        where: { OR: [{ alumnusId: userId }, { studentId: userId }] },
        select: { id: true },
      })
    ).map((row) => row.id);
    await tx.pointEntry.updateMany({
      where: { sourceType: 'REFERRAL', sourceId: { in: referralIds }, status: 'PENDING' },
      data: { status: 'REVOKED', revokedAt: now, revokedReason: 'REFERRAL_CANCELLED' },
    });
    await tx.referralClaim.deleteMany({ where: { id: { in: referralIds } } });
    await tx.referralClaim.updateMany({
      where: { reviewedById: userId },
      data: { reviewedById: null },
    });
    await tx.referralClaim.updateMany({
      where: { acceptanceReviewedById: userId },
      data: { acceptanceReviewedById: null },
    });

    // İlanlar (P2-04): yazdığı ilanlar (hedef bölümleri ve şikâyetleriyle) tamamen silinir; ilan metni kişiye ait içeriktir ve
    // yazarsız yayında kalmaz. Raportör bağı (şikâyet satırı) `SET NULL` ile kopar; moderatör/kaldıran bağı kopar.
    await tx.jobPosting.deleteMany({ where: { authorId: userId } });
    await tx.jobPostingReport.updateMany({
      where: { reporterId: userId },
      data: { reporterId: null },
    });

    // Katkı puanı (P1-16): kişiye ait puan kayıtları, etiketler ve şüphe işaretleri silinir; başkalarının kayıtlarındaki
    // karşı taraf bağı kopar (kayıt ve puan kalır). Önce etiket: kaynak kayıt silinmeden bağ düşer.
    await tx.userBadge.deleteMany({ where: { userId } });
    await tx.award.deleteMany({ where: { userId } });
    await tx.awardCandidate.deleteMany({ where: { userId } });
    await tx.alumniStory.deleteMany({ where: { userId } });
    await tx.suspicionFlag.deleteMany({ where: { userId } });
    await tx.pointEntry.deleteMany({ where: { userId } });
    await tx.pointEntry.updateMany({
      where: { counterpartId: userId },
      data: { counterpartId: null },
    });

    // Kullanım olayları (P1-13): sayılar kalır, kullanıcıyla bağ hemen kopar.
    await tx.event.updateMany({ where: { userId }, data: { userId: null } });

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
    await tx.jobMatch.deleteMany({ where: { userId } });
    await tx.companyFollow.deleteMany({ where: { userId } });
    await tx.eventAttendance.deleteMany({ where: { userId } });
    await tx.campusEventRegistration.deleteMany({ where: { userId } });
    await tx.campusEvent.updateMany({
      where: { createdById: userId },
      data: { createdById: null },
    });
    await tx.campusEvent.updateMany({
      where: { reviewedById: userId },
      data: { reviewedById: null, reviewReason: null },
    });
    await tx.jobMatchDigest.deleteMany({ where: { userId } });
    await tx.notificationIntent.deleteMany({ where: { userId } });
    await tx.inAppNotification.deleteMany({ where: { userId } });
    await tx.sessionFeedback.deleteMany({ where: { authorId: userId } });
    await tx.notificationPreference.deleteMany({ where: { userId } });
    await tx.notificationAction.deleteMany({ where: { userId } });
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
