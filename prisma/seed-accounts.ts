import type { PrismaClient } from '../src/generated/prisma/client';
import { INSTITUTION_SEED, TEST_PERSONAS, type TestPersonaKey } from './seed-data';
import { seedId, seedTime } from './seed-util';

type Persona = (typeof TEST_PERSONAS)[TestPersonaKey];

// Yabancı anahtar sırası: sistem yöneticisi önce (diğer kayıtların doğrulayanı/yetki vereni olur).
const ORDER: readonly TestPersonaKey[] = [
  'systemAdmin',
  'departmentAdmin',
  'academic',
  'student',
  'seniorMentor',
  'alumniMentor',
];

/** Seed kimlikleri tek yerde: üyelik/yetki kimlikleri de anahtardan türer (deterministik). */
export const seedUserId = (key: TestPersonaKey) => seedId('user', key);

const VERIFICATION_METHOD = {
  STUDENT: 'STUDENT_EMAIL',
  ACADEMIC: 'STAFF_EMAIL',
  ALUMNI: 'GRADUATION_DOCUMENT',
} as const;

/**
 * Rol başına test kullanıcıları (öğrenci, üst sınıf mentor, mezun mentor, akademisyen, bölüm yöneticisi,
 * sistem yöneticisi): kullanıcı + doğrulanmış üyelik (+ mentor profili / yönetici yetkisi). İdempotenttir:
 * kullanıcı kimlikle upsert edilir, etkin üyelik/yetki doğal anahtarla bulunup eşitlenir. Giriş bilgisi
 * üretmez (test girişi P1-02).
 */
export async function seedAccounts(prisma: PrismaClient) {
  const department = await prisma.department.findFirstOrThrow({
    where: {
      code: INSTITUTION_SEED.department.code,
      faculty: {
        name: INSTITUTION_SEED.faculty.name,
        university: { name: INSTITUTION_SEED.university.name },
      },
    },
    select: { id: true },
  });
  const verifiedAt = seedTime();

  for (const key of ORDER) {
    const persona: Persona = TEST_PERSONAS[key];
    const userId = seedUserId(key);
    const profile = {
      name: persona.name,
      email: persona.email,
      emailVerified: true,
      banned: false,
      banReason: null,
      banExpires: null,
      deletedAt: null,
    };
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, createdAt: verifiedAt, ...profile },
      update: profile,
    });

    // Etkin üyelik (kullanıcı + bölüm + rol): yoksa oluştur, varsa eşitle.
    const membership = {
      entryYear: 'entryYear' in persona ? persona.entryYear : null,
      graduationYear: 'graduationYear' in persona ? persona.graduationYear : null,
      classOffset: 0,
      verificationStatus: 'VERIFIED' as const,
      verificationMethod: VERIFICATION_METHOD[persona.role],
      verifiedAt,
      // Belge ile doğrulanan mezunu sistem yöneticisi doğrulamış gibi kaydedilir (veritabanı kısıtı).
      verifiedById: persona.role === 'ALUMNI' ? seedUserId('systemAdmin') : null,
    };
    const existingMembership = await prisma.membership.findFirst({
      where: { userId, departmentId: department.id, role: persona.role, endedAt: null },
      select: { id: true },
    });
    if (existingMembership) {
      await prisma.membership.update({ where: { id: existingMembership.id }, data: membership });
    } else {
      await prisma.membership.create({
        data: {
          id: seedId('membership', key),
          userId,
          departmentId: department.id,
          role: persona.role,
          createdAt: verifiedAt,
          ...membership,
        },
      });
    }

    if ('mentor' in persona) {
      const mentor = {
        isActive: true,
        monthlyCapacity: persona.mentor.monthlyCapacity,
        sessionMinutes: persona.mentor.sessionMinutes,
        meetingModes: [...persona.mentor.meetingModes],
        inPersonNote: persona.mentor.inPersonNote,
        pausedUntil: null,
        cvReviewEnabled: persona.mentor.cvReviewEnabled,
        cvReviewMonthlyLimit: persona.mentor.cvReviewMonthlyLimit,
      };
      await prisma.mentorProfile.upsert({
        where: { userId },
        create: { userId, createdAt: verifiedAt, ...mentor },
        update: mentor,
      });
    }

    if ('grant' in persona) {
      const isSystem = persona.grant === 'SYSTEM';
      const target = {
        scope: persona.grant,
        facultyId: null,
        departmentId: isSystem ? null : department.id,
      };
      const existingGrant = await prisma.adminGrant.findFirst({
        where: { userId, ...target, revokedAt: null },
        select: { id: true },
      });
      if (!existingGrant) {
        await prisma.adminGrant.create({
          data: {
            id: seedId('grant', key),
            userId,
            ...target,
            // Sistem yöneticisi kendi yetkisini verir (ilk yönetici); diğerleri onun verdiğidir.
            grantedById: isSystem ? userId : seedUserId('systemAdmin'),
            createdAt: verifiedAt,
          },
        });
      }
    }
  }
}
