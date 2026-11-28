import 'server-only';

import { MENTOR_SETTINGS_DEFAULTS } from '@/contracts/appointment';
import type { Prisma } from '@/generated/prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Mentorluğu aç/kapat (kart 572). Yalnız `isActive` değişir; ayarlara, müsaitlik kurallarına ve randevulara dokunulmaz.
 * Ayar satırı hiç yoksa kapatma, forma önerilen değerlerle KAPALI bir satır kurar (satır kapalıyken listelenmez, randevu almaz);
 * açma satır yoksa aynı değerlerle açık satır kurar. Çağıran kullanıcı satırını kilitlemiş ve uygunluğu denetlemiş olmalıdır.
 */
export async function setMentorProfileActive(
  tx: Tx,
  userId: string,
  isActive: boolean,
): Promise<void> {
  await tx.mentorProfile.upsert({
    where: { userId },
    create: {
      userId,
      isActive,
      monthlyCapacity: MENTOR_SETTINGS_DEFAULTS.monthlyCapacity,
      sessionMinutes: MENTOR_SETTINGS_DEFAULTS.sessionMinutes,
      meetingModes: [...MENTOR_SETTINGS_DEFAULTS.meetingModes],
    },
    update: { isActive },
  });
}

/**
 * İlk giriş mentor adımının öğrenci mentordaki karşılığı: "Hayır" mentorluğu bırakır, "Evet" daha önce bırakılmışsa geri açar.
 * Yalnız doğrulanmış öğrenci üyeliği olan ve mezun/akademisyen olmayan kullanıcıda etkilidir; mezun/akademisyen kendi ayarlarından
 * yönetir. Sınıf uygunluğunu çağıran (`mentorStepAvailable`) denetler.
 */
export async function applyStudentMentorPreference(
  tx: Tx,
  userId: string,
  interested: boolean,
): Promise<void> {
  const memberships = await tx.membership.findMany({
    where: { userId, endedAt: null, verificationStatus: 'VERIFIED' },
    select: { role: true },
  });
  const roles = new Set(memberships.map((membership) => membership.role));
  if (!roles.has('STUDENT') || roles.has('ALUMNI') || roles.has('ACADEMIC')) return;
  if (interested)
    await tx.mentorProfile.updateMany({
      where: { userId, isActive: false },
      data: { isActive: true },
    });
  else await setMentorProfileActive(tx, userId, false);
}
