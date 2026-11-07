import { afterAll, describe, expect, it } from 'vitest';

import {
  addGrant,
  addMembership,
  addMentorProfile,
  createInstitution,
  createUser,
} from '@/test/fixtures';
import { createTestPrisma } from '@/test/db';

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

/** Veritabanı kısıtı ihlalinde Prisma/Postgres hata metninin verilen kısıt adını taşıdığını doğrular. */
async function expectDbReject(operation: Promise<unknown>, constraint: string) {
  const error = await operation.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error, `${constraint} ihlali bekleniyordu`).not.toBeNull();
  expect(String((error as Error).message) + JSON.stringify(error)).toContain(constraint);
}

const baseMembership = (userId: string, departmentId: string) => ({
  userId,
  departmentId,
  role: 'STUDENT' as const,
  verificationStatus: 'PENDING' as const,
  verificationMethod: 'STUDENT_EMAIL' as const,
});

describe('Membership kısıtları', () => {
  it('aynı kullanıcı+bölüm+rolde ikinci ETKİN üyelik reddedilir', async () => {
    const inst = await createInstitution(prisma);
    const userId = await createUser(prisma);
    await addMembership(prisma, { userId, departmentId: inst.deptA1, role: 'STUDENT' });

    await expectDbReject(
      prisma.membership.create({ data: baseMembership(userId, inst.deptA1) }),
      'Membership_active_user_department_role_key',
    );
  });

  it('üyelik kapandıktan sonra aynı bölüm+rolde yenisi açılabilir; geçmiş korunur', async () => {
    const inst = await createInstitution(prisma);
    const userId = await createUser(prisma);
    await addMembership(prisma, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      endedAt: new Date('2026-01-01'),
    });
    await addMembership(prisma, { userId, departmentId: inst.deptA1, role: 'STUDENT' });

    expect(await prisma.membership.count({ where: { userId } })).toBe(2);
  });

  it('çoklu rol: farklı bölüm ya da rolde birden çok etkin üyelik serbest', async () => {
    const inst = await createInstitution(prisma);
    const userId = await createUser(prisma);
    await addMembership(prisma, { userId, departmentId: inst.deptA1, role: 'STUDENT' });
    await addMembership(prisma, { userId, departmentId: inst.deptB1, role: 'ACADEMIC' });
    await addMembership(prisma, { userId, departmentId: inst.deptA2, role: 'ALUMNI' });

    expect(await prisma.membership.count({ where: { userId, endedAt: null } })).toBe(3);
  });

  it.each([
    ['mezun alan adıyla doğrulanamaz', { role: 'ALUMNI', verificationMethod: 'STUDENT_EMAIL' }],
    [
      'öğrenci personel e-postasıyla doğrulanamaz',
      { role: 'STUDENT', verificationMethod: 'STAFF_EMAIL' },
    ],
    [
      'akademisyen belgeyle doğrulanamaz',
      { role: 'ACADEMIC', verificationMethod: 'GRADUATION_DOCUMENT' },
    ],
    [
      'öğrenci belgeyle doğrulanamaz',
      { role: 'STUDENT', verificationMethod: 'GRADUATION_DOCUMENT' },
    ],
  ] as const)('rol↔doğrulama yolu: %s', async (_label, data) => {
    const inst = await createInstitution(prisma);
    const userId = await createUser(prisma);
    await expectDbReject(
      prisma.membership.create({
        data: { ...baseMembership(userId, inst.deptA1), ...data },
      }),
      'Membership_method_matches_role_check',
    );
  });

  it('yönetici (ADMIN) herhangi bir rolü doğrulayabilir', async () => {
    const inst = await createInstitution(prisma);
    const userId = await createUser(prisma);
    const adminId = await createUser(prisma);
    await expect(
      prisma.membership.create({
        data: {
          ...baseMembership(userId, inst.deptA1),
          role: 'ALUMNI',
          verificationMethod: 'ADMIN',
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedById: adminId,
        },
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['VERIFIED ama verifiedAt boş', { verificationStatus: 'VERIFIED', verifiedAt: null }],
    ['PENDING ama verifiedAt dolu', { verificationStatus: 'PENDING', verifiedAt: new Date() }],
    ['REJECTED ama verifiedAt dolu', { verificationStatus: 'REJECTED', verifiedAt: new Date() }],
  ] as const)('doğrulama tutarlılığı: %s', async (_label, data) => {
    const inst = await createInstitution(prisma);
    const userId = await createUser(prisma);
    await expectDbReject(
      prisma.membership.create({ data: { ...baseMembership(userId, inst.deptA1), ...data } }),
      'Membership_verification_consistent_check',
    );
  });

  it('belge/yönetici ile doğrulanan üyelikte doğrulayan kullanıcı zorunlu', async () => {
    const inst = await createInstitution(prisma);
    const userId = await createUser(prisma);
    await expectDbReject(
      prisma.membership.create({
        data: {
          ...baseMembership(userId, inst.deptA1),
          role: 'ALUMNI',
          verificationMethod: 'GRADUATION_DOCUMENT',
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedById: null,
        },
      }),
      'Membership_verification_consistent_check',
    );
  });

  it.each([
    ['giriş yılı çok eski', { entryYear: 1900 }],
    ['giriş yılı çok ileri', { entryYear: 2101 }],
    ['sınıf düzeltmesi aralık dışı (+4)', { classOffset: 4 }],
    ['sınıf düzeltmesi aralık dışı (−4)', { classOffset: -4 }],
    ['öğrencide mezuniyet yılı olamaz', { graduationYear: 2026 }],
  ] as const)('yıl/düzeltme kısıtı: %s', async (_label, data) => {
    const inst = await createInstitution(prisma);
    const userId = await createUser(prisma);
    await expectDbReject(
      prisma.membership.create({ data: { ...baseMembership(userId, inst.deptA1), ...data } }),
      'Membership_years_check',
    );
  });

  it('mezuniyet yılı giriş yılından önce olamaz; mezunda sınıf düzeltmesi 0 olmalı; akademisyende yıl yok', async () => {
    const inst = await createInstitution(prisma);
    const alumni = {
      role: 'ALUMNI' as const,
      verificationMethod: 'GRADUATION_DOCUMENT' as const,
    };
    await expectDbReject(
      prisma.membership.create({
        data: {
          ...baseMembership(await createUser(prisma), inst.deptA1),
          ...alumni,
          entryYear: 2022,
          graduationYear: 2021,
        },
      }),
      'Membership_years_check',
    );
    await expectDbReject(
      prisma.membership.create({
        data: {
          ...baseMembership(await createUser(prisma), inst.deptA1),
          ...alumni,
          classOffset: 1,
        },
      }),
      'Membership_years_check',
    );
    await expectDbReject(
      prisma.membership.create({
        data: {
          ...baseMembership(await createUser(prisma), inst.deptA1),
          role: 'ACADEMIC',
          verificationMethod: 'STAFF_EMAIL',
          entryYear: 2000,
        },
      }),
      'Membership_years_check',
    );
  });

  it('bölümü olan üyelik varken bölüm silinemez (Restrict)', async () => {
    const inst = await createInstitution(prisma);
    await addMembership(prisma, {
      userId: await createUser(prisma),
      departmentId: inst.deptA1,
      role: 'STUDENT',
    });
    await expect(prisma.department.delete({ where: { id: inst.deptA1 } })).rejects.toThrow();
  });

  it('üyeliği olan kullanıcı silinemez (geçmiş korunur)', async () => {
    const inst = await createInstitution(prisma);
    const userId = await createUser(prisma);
    await addMembership(prisma, { userId, departmentId: inst.deptA1, role: 'STUDENT' });
    await expect(prisma.user.delete({ where: { id: userId } })).rejects.toThrow();
  });
});

describe('AdminGrant kısıtları', () => {
  it.each([
    ['SYSTEM bölümle', { scope: 'SYSTEM', withDepartment: true }],
    ['SYSTEM fakülteyle', { scope: 'SYSTEM', withFaculty: true }],
    ['FACULTY fakültesiz', { scope: 'FACULTY' }],
    ['FACULTY bölümle', { scope: 'FACULTY', withFaculty: true, withDepartment: true }],
    ['DEPARTMENT bölümsüz', { scope: 'DEPARTMENT' }],
    ['DEPARTMENT fakülteyle', { scope: 'DEPARTMENT', withFaculty: true, withDepartment: true }],
  ] as const)('kapsam↔hedef uyumsuzluğu reddedilir: %s', async (_label, spec) => {
    const inst = await createInstitution(prisma);
    const grantedById = await createUser(prisma);
    await expectDbReject(
      prisma.adminGrant.create({
        data: {
          userId: await createUser(prisma),
          scope: spec.scope,
          facultyId: 'withFaculty' in spec ? inst.facultyA : null,
          departmentId: 'withDepartment' in spec ? inst.deptA1 : null,
          grantedById,
        },
      }),
      'AdminGrant_scope_target_check',
    );
  });

  it('aynı kullanıcıya aynı kapsam için ikinci ETKİN yetki reddedilir (SYSTEM dahil: NULL’lar eşit sayılır)', async () => {
    const inst = await createInstitution(prisma);
    const userId = await createUser(prisma);
    await addGrant(prisma, { userId, scope: 'SYSTEM' });
    await expectDbReject(
      addGrant(prisma, { userId, scope: 'SYSTEM' }),
      'AdminGrant_active_user_scope_target_key',
    );

    await addGrant(prisma, { userId, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
    await expectDbReject(
      addGrant(prisma, { userId, scope: 'DEPARTMENT', departmentId: inst.deptA1 }),
      'AdminGrant_active_user_scope_target_key',
    );
    // farklı bölüm serbest
    await addGrant(prisma, { userId, scope: 'DEPARTMENT', departmentId: inst.deptA2 });
  });

  it('kaldırılmış yetkiden sonra aynı kapsam yeniden verilebilir', async () => {
    const userId = await createUser(prisma);
    await addGrant(prisma, { userId, scope: 'SYSTEM', revoked: true });
    await expect(addGrant(prisma, { userId, scope: 'SYSTEM' })).resolves.toBeDefined();
  });

  it('kaldırma zamanı ve kaldıran kullanıcı birlikte dolar', async () => {
    const userId = await createUser(prisma);
    const grantedById = await createUser(prisma);
    await expectDbReject(
      prisma.adminGrant.create({
        data: { userId, scope: 'SYSTEM', grantedById, revokedAt: new Date(), revokedById: null },
      }),
      'AdminGrant_revocation_consistent_check',
    );
  });
});

describe('MentorProfile kısıtları', () => {
  const profile = (userId: string) => ({
    userId,
    monthlyCapacity: 4,
    sessionMinutes: 30,
    meetingModes: ['ONLINE' as const],
  });

  it('görüşme süresi 15/20/30 dışında olamaz', async () => {
    await expectDbReject(
      prisma.mentorProfile.create({
        data: { ...profile(await createUser(prisma)), sessionMinutes: 25 },
      }),
      'MentorProfile_settings_check',
    );
    for (const sessionMinutes of [15, 20, 30]) {
      await expect(
        prisma.mentorProfile.create({
          data: { ...profile(await createUser(prisma)), sessionMinutes },
        }),
      ).resolves.toBeDefined();
    }
  });

  it('negatif kapasite ve inceleme sınırı reddedilir', async () => {
    await expectDbReject(
      prisma.mentorProfile.create({
        data: { ...profile(await createUser(prisma)), monthlyCapacity: -1 },
      }),
      'MentorProfile_settings_check',
    );
    await expectDbReject(
      prisma.mentorProfile.create({
        data: { ...profile(await createUser(prisma)), cvReviewMonthlyLimit: -1 },
      }),
      'MentorProfile_settings_check',
    );
  });

  it('etkin profilin en az bir görüşme biçimi olmalı; kapalı profilde boş olabilir', async () => {
    await expectDbReject(
      prisma.mentorProfile.create({
        data: { ...profile(await createUser(prisma)), isActive: true, meetingModes: [] },
      }),
      'MentorProfile_settings_check',
    );
    await expect(
      prisma.mentorProfile.create({
        data: { ...profile(await createUser(prisma)), isActive: false, meetingModes: [] },
      }),
    ).resolves.toBeDefined();
  });

  it('kullanıcı başına tek profil', async () => {
    const userId = await createUser(prisma);
    await addMentorProfile(prisma, userId);
    await expect(addMentorProfile(prisma, userId)).rejects.toThrow();
  });
});

describe('AdminAuditLog: yalnız eklenir', () => {
  async function insertEntry() {
    const actorId = await createUser(prisma);
    const row = await prisma.adminAuditLog.create({
      data: {
        actorId,
        action: 'ROLE_TRANSITION',
        targetType: 'MEMBERSHIP',
        targetId: 'x',
        metadata: { a: 1 },
      },
      select: { id: true },
    });
    return { actorId, id: row.id };
  }

  it('satır eklenir ve okunur', async () => {
    const { id } = await insertEntry();
    expect(await prisma.adminAuditLog.findUnique({ where: { id } })).not.toBeNull();
  });

  it('UPDATE (Prisma ve ham SQL) reddedilir; kayıt değişmez', async () => {
    const { id } = await insertEntry();
    // Prisma, tetikleyicinin restrict_violation (23001) hatasını P2003 olarak bildirir; asıl kanıt
    // reddedilmesi ve kaydın değişmemesidir.
    await expect(
      prisma.adminAuditLog.update({ where: { id }, data: { reason: 'sonradan değiştirildi' } }),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`UPDATE "AdminAuditLog" SET "action" = 'X' WHERE "id" = ${id}`,
    ).rejects.toThrow(/yalnız eklenir/);
    expect((await prisma.adminAuditLog.findUniqueOrThrow({ where: { id } })).reason).toBeNull();
  });

  it('DELETE reddedilir; kayıt kalır', async () => {
    const { id } = await insertEntry();
    await expect(prisma.adminAuditLog.delete({ where: { id } })).rejects.toThrow();
    await expect(
      prisma.$executeRaw`DELETE FROM "AdminAuditLog" WHERE "id" = ${id}`,
    ).rejects.toThrow(/yalnız eklenir/);
    expect(await prisma.adminAuditLog.findUnique({ where: { id } })).not.toBeNull();
  });

  it('TRUNCATE reddedilir', async () => {
    await insertEntry();
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "AdminAuditLog"')).rejects.toThrow(
      /yalnız eklenir/,
    );
  });

  it('kaydı olan yönetici silinemez', async () => {
    const { actorId } = await insertEntry();
    await expect(prisma.user.delete({ where: { id: actorId } })).rejects.toThrow();
  });

  it('biçim kısıtları: boş eylem, uzun gerekçe ve nesne olmayan metadata reddedilir', async () => {
    const actorId = await createUser(prisma);
    const base = { actorId, action: 'A', targetType: 'USER', targetId: 'x' };
    await expectDbReject(
      prisma.adminAuditLog.create({ data: { ...base, action: '' } }),
      'AdminAuditLog_shape_check',
    );
    await expectDbReject(
      prisma.adminAuditLog.create({ data: { ...base, reason: 'x'.repeat(1001) } }),
      'AdminAuditLog_shape_check',
    );
    await expectDbReject(
      prisma.adminAuditLog.create({ data: { ...base, metadata: [1, 2] } }),
      'AdminAuditLog_shape_check',
    );
  });
});
