import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isCodedError, type ErrorCode } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  addMentorProfile,
  createInstitution,
  createUser,
  type Institution,
} from '@/test/fixtures';

import { transitionStudentToAlumni, type AlumniTransitionInput } from './membership';

const prisma = createTestPrisma();
const NOW = new Date('2026-11-07T12:00:00Z');

let inst: Institution;
let deptAdmin: string; // A1 bölüm yöneticisi
let otherDeptAdmin: string; // A2 bölüm yöneticisi
let otherFacultyAdmin: string; // B fakültesi yöneticisi
let facultyAdmin: string; // A fakültesi yöneticisi
let sysAdmin: string;

afterAll(() => prisma.$disconnect());

beforeAll(async () => {
  inst = await createInstitution(prisma);
  const admin = async (
    departmentId: string,
    grant: Parameters<typeof addGrant>[1] extends infer G ? Omit<G & object, 'userId'> : never,
  ) => {
    const userId = await createUser(prisma);
    await addMembership(prisma, { userId, departmentId, role: 'ACADEMIC' });
    await addGrant(prisma, { userId, ...grant });
    return userId;
  };
  deptAdmin = await admin(inst.deptA1, { scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  otherDeptAdmin = await admin(inst.deptA2, { scope: 'DEPARTMENT', departmentId: inst.deptA2 });
  otherFacultyAdmin = await admin(inst.deptB1, { scope: 'FACULTY', facultyId: inst.facultyB });
  facultyAdmin = await admin(inst.deptA1, { scope: 'FACULTY', facultyId: inst.facultyA });
  sysAdmin = await admin(inst.deptA1, { scope: 'SYSTEM' });
});

async function newStudent(entryYear = 2022): Promise<{ userId: string; studentId: string }> {
  const userId = await createUser(prisma);
  const studentId = await addMembership(prisma, {
    userId,
    departmentId: inst.deptA1,
    role: 'STUDENT',
    entryYear,
  });
  return { userId, studentId };
}

const transition = (userId: string, overrides: Partial<AlumniTransitionInput> = {}) =>
  transitionStudentToAlumni(prisma, {
    admin: { userId: deptAdmin },
    userId,
    departmentId: inst.deptA1,
    graduationYear: 2026,
    method: 'GRADUATION_DOCUMENT',
    now: NOW,
    ...overrides,
  });

async function codeOf(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    if (isCodedError(error)) return error.code;
    throw error;
  }
  return 'OK';
}

describe('transitionStudentToAlumni: mutlu yol', () => {
  it('öğrenci üyeliği kapanır, doğrulanmış mezun üyeliği eklenir; geçmiş korunur', async () => {
    const { userId, studentId } = await newStudent(2022);

    const result = await transition(userId);

    expect(result.outcome).toBe('TRANSITIONED');
    expect(result.studentMembershipId).toBe(studentId);

    const rows = await prisma.membership.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2); // hiçbir satır silinmedi
    const student = rows.find((row) => row.id === studentId);
    const alumni = rows.find((row) => row.id === result.alumniMembershipId);
    expect(student).toMatchObject({
      role: 'STUDENT',
      verificationStatus: 'VERIFIED',
      entryYear: 2022,
    });
    expect(student?.endedAt).toEqual(NOW);
    expect(alumni).toMatchObject({
      role: 'ALUMNI',
      departmentId: inst.deptA1,
      verificationStatus: 'VERIFIED',
      verificationMethod: 'GRADUATION_DOCUMENT',
      verifiedById: deptAdmin,
      graduationYear: 2026,
      entryYear: 2022,
      endedAt: null,
    });
    expect(alumni?.verifiedAt).toEqual(NOW);
  });

  it('kullanıcı, mentor profili ve diğer kayıtlar aynı kalır (içerik/puan userId’de durur)', async () => {
    const { userId } = await newStudent();
    await addMentorProfile(prisma, userId);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    await transition(userId);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.id).toBe(before.id);
    expect(after.email).toBe(before.email);
    expect(after.banned).toBe(false);
    expect(await prisma.mentorProfile.count({ where: { userId, isActive: true } })).toBe(1);
  });

  it('işlem kaydı yazılır: kim, ne, hangi kayıt, kimlikler (kişisel veri yok)', async () => {
    const { userId, studentId } = await newStudent();

    const result = await transition(userId, { reason: 'Toplu mezun listesi', method: 'ADMIN' });

    const log = await prisma.adminAuditLog.findFirstOrThrow({
      where: { actorId: deptAdmin, targetId: result.alumniMembershipId },
    });
    expect(log).toMatchObject({
      action: 'ROLE_TRANSITION',
      targetType: 'MEMBERSHIP',
      reason: 'Toplu mezun listesi',
      metadata: {
        userId,
        departmentId: inst.deptA1,
        fromMembershipId: studentId,
        toMembershipId: result.alumniMembershipId,
        alumniAction: 'CREATE',
        method: 'ADMIN',
        graduationYear: 2026,
      },
    });
    expect(JSON.stringify(log.metadata)).not.toMatch(/@/);
  });

  it('belge akışı: bekleyen mezun üyeliği aynı satırda doğrulanır (çift mezun satırı oluşmaz)', async () => {
    const { userId } = await newStudent();
    const pendingId = await addMembership(prisma, {
      userId,
      departmentId: inst.deptA1,
      role: 'ALUMNI',
      status: 'PENDING',
    });

    const result = await transition(userId);

    expect(result.alumniMembershipId).toBe(pendingId);
    const alumni = await prisma.membership.findMany({ where: { userId, role: 'ALUMNI' } });
    expect(alumni).toHaveLength(1);
    expect(alumni[0]).toMatchObject({ verificationStatus: 'VERIFIED', verifiedById: deptAdmin });
    const log = await prisma.adminAuditLog.findFirstOrThrow({
      where: { targetId: pendingId, action: 'ROLE_TRANSITION' },
    });
    expect(log.metadata).toMatchObject({ alumniAction: 'VERIFY_PENDING' });
  });

  it('çoklu rol: yalnız verilen bölümdeki öğrenci üyeliği kapanır, başka bölümdeki öğrenci üyeliği sürer', async () => {
    const { userId } = await newStudent();
    const otherDeptStudent = await addMembership(prisma, {
      userId,
      departmentId: inst.deptA2,
      role: 'STUDENT',
      entryYear: 2023,
    });

    await transition(userId);

    const untouched = await prisma.membership.findUniqueOrThrow({
      where: { id: otherDeptStudent },
    });
    expect(untouched.endedAt).toBeNull();
    expect(await prisma.membership.count({ where: { userId, endedAt: null } })).toBe(2); // A2 öğrenci + A1 mezun
  });

  it('fakülte ve sistem yöneticisi de geçiş yapabilir', async () => {
    for (const admin of [facultyAdmin, sysAdmin]) {
      const { userId } = await newStudent();
      expect((await transition(userId, { admin: { userId: admin } })).outcome).toBe('TRANSITIONED');
    }
  });
});

describe('transitionStudentToAlumni: içerik ve puan kullanıcıda kalır', () => {
  it('kullanıcıya bağlı içerik/puan satırları geçişten sonra aynı kullanıcıda durur ve yeni mezun üyeliğiyle birlikte okunur', async () => {
    // İçerik (deneyim) ve puan tabloları sonraki adımlarda gelir; tasarım gereği `userId` anahtarlıdır.
    // Aynı biçimde bir yer tutucu tabloyla geçişin bu satırlara dokunmadığı kanıtlanır.
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "ScratchContent" ("id" serial PRIMARY KEY, "userId" text NOT NULL REFERENCES "User"("id"), "kind" text NOT NULL, "points" integer NOT NULL)',
    );
    const { userId } = await newStudent();
    await prisma.$executeRaw`INSERT INTO "ScratchContent" ("userId", "kind", "points") VALUES (${userId}, 'experience', 5), (${userId}, 'points', 12)`;

    await transition(userId);

    const rows = await prisma.$queryRaw<{ kind: string; points: number }[]>`
      SELECT c."kind", c."points" FROM "ScratchContent" c
      JOIN "Membership" m ON m."userId" = c."userId" AND m."endedAt" IS NULL AND m."role" = 'ALUMNI'
      WHERE c."userId" = ${userId} ORDER BY c."kind"`;
    expect(rows).toEqual([
      { kind: 'experience', points: 5 },
      { kind: 'points', points: 12 },
    ]);
    // Eski öğrenci üyeliği de geçmişte okunabilir kalır.
    expect(
      await prisma.membership.count({ where: { userId, role: 'STUDENT', endedAt: { not: null } } }),
    ).toBe(1);
  });
});

describe('transitionStudentToAlumni: idempotans ve eşzamanlılık', () => {
  it('ikinci çağrı ALREADY_TRANSITIONED döner; yeni satır ve ikinci denetim kaydı yok', async () => {
    const { userId } = await newStudent();
    const first = await transition(userId);
    const second = await transition(userId);

    expect(second).toEqual({
      outcome: 'ALREADY_TRANSITIONED',
      studentMembershipId: null,
      alumniMembershipId: first.alumniMembershipId,
    });
    expect(await prisma.membership.count({ where: { userId } })).toBe(2);
    expect(
      await prisma.adminAuditLog.count({
        where: { action: 'ROLE_TRANSITION', targetId: first.alumniMembershipId },
      }),
    ).toBe(1);
  });

  it('eşzamanlı iki çağrıdan yalnız biri uygular; tek etkin mezun üyeliği ve tek denetim kaydı kalır', async () => {
    const { userId } = await newStudent();

    const results = await Promise.all([transition(userId), transition(userId), transition(userId)]);

    expect(results.filter((r) => r.outcome === 'TRANSITIONED')).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'ALREADY_TRANSITIONED')).toHaveLength(2);
    expect(new Set(results.map((r) => r.alumniMembershipId)).size).toBe(1);
    expect(
      await prisma.membership.count({ where: { userId, role: 'ALUMNI', endedAt: null } }),
    ).toBe(1);
    expect(
      await prisma.membership.count({ where: { userId, role: 'STUDENT', endedAt: null } }),
    ).toBe(0);
    const [alumni] = results;
    expect(
      await prisma.adminAuditLog.count({
        where: { action: 'ROLE_TRANSITION', targetId: alumni?.alumniMembershipId },
      }),
    ).toBe(1);
  });
});

describe('transitionStudentToAlumni: satır kilidi (deterministik yarış)', () => {
  it('başka bir işlem geçişi tamamlarken çağrı kilitte bekler, sonra güncel durumu görüp ALREADY_TRANSITIONED döner', async () => {
    const { userId, studentId } = await newStudent();
    let release!: () => void;
    let locked!: () => void;
    const lockedSignal = new Promise<void>((resolve) => (locked = resolve));
    const releaseSignal = new Promise<void>((resolve) => (release = resolve));

    // “Kazanan” işlem: üyelik satırlarını kilitler, geçişi kendisi uygular, sonra bırakır.
    const winner = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "userId" = ${userId} FOR UPDATE`;
      locked();
      await releaseSignal;
      await tx.membership.update({ where: { id: studentId }, data: { endedAt: NOW } });
      await tx.membership.create({
        data: {
          userId,
          departmentId: inst.deptA1,
          role: 'ALUMNI',
          entryYear: 2022,
          graduationYear: 2026,
          verificationStatus: 'VERIFIED',
          verificationMethod: 'GRADUATION_DOCUMENT',
          verifiedAt: NOW,
          verifiedById: deptAdmin,
        },
      });
    });
    await lockedSignal;

    const racing = transition(userId);
    const state = await Promise.race([
      racing.then(
        () => 'finished',
        () => 'failed',
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('waiting'), 500)),
    ]);
    expect(state).toBe('waiting'); // kilit bırakılana kadar ilerlemez

    release();
    await winner;
    // Kilit olmasaydı yarışan çağrı bayat durumla ikinci mezun üyeliği eklemeye çalışır ve düşerdi.
    const result = await racing;
    expect(result.outcome).toBe('ALREADY_TRANSITIONED');
    expect(
      await prisma.membership.count({ where: { userId, role: 'ALUMNI', endedAt: null } }),
    ).toBe(1);
    expect(
      await prisma.adminAuditLog.count({
        where: { metadata: { path: ['userId'], equals: userId } },
      }),
    ).toBe(0);
  });
});

describe('transitionStudentToAlumni: negatif yollar (hiçbir değişiklik olmaz)', () => {
  async function expectUnchanged(userId: string, studentId: string) {
    const student = await prisma.membership.findUniqueOrThrow({ where: { id: studentId } });
    expect(student.endedAt).toBeNull();
    expect(await prisma.membership.count({ where: { userId, role: 'ALUMNI' } })).toBe(0);
    expect(
      await prisma.adminAuditLog.count({
        where: { targetType: 'MEMBERSHIP', metadata: { path: ['userId'], equals: userId } },
      }),
    ).toBe(0);
  }

  it.each([
    ['başka bölümün yöneticisi', () => otherDeptAdmin, 'AUTH_FORBIDDEN'],
    ['başka fakültenin yöneticisi', () => otherFacultyAdmin, 'AUTH_FORBIDDEN'],
  ] as const)('%s', async (_label, admin, code) => {
    const { userId, studentId } = await newStudent();
    expect(await codeOf(transition(userId, { admin: { userId: admin() } }))).toBe(code);
    await expectUnchanged(userId, studentId);
  });

  it('yönetici olmayan kullanıcı (öğrencinin kendisi dahil) geçiş yapamaz', async () => {
    const { userId, studentId } = await newStudent();
    expect(await codeOf(transition(userId, { admin: { userId } }))).toBe('AUTH_FORBIDDEN');
    const bystander = await createUser(prisma);
    expect(await codeOf(transition(userId, { admin: { userId: bystander } }))).toBe(
      'AUTH_FORBIDDEN',
    );
    await expectUnchanged(userId, studentId);
  });

  it('var olmayan yönetici ya da bölüm AUTH_FORBIDDEN', async () => {
    const { userId, studentId } = await newStudent();
    expect(await codeOf(transition(userId, { admin: { userId: 'yok-yok' } }))).toBe(
      'AUTH_FORBIDDEN',
    );
    expect(await codeOf(transition(userId, { departmentId: 'yok-yok' }))).toBe('AUTH_FORBIDDEN');
    await expectUnchanged(userId, studentId);
  });

  it('askıdaki yönetici AUTH_ACCOUNT_SUSPENDED; yetkisi kaldırılmış yönetici AUTH_FORBIDDEN', async () => {
    const { userId, studentId } = await newStudent();
    const suspended = await createUser(prisma, { banned: true });
    await addMembership(prisma, { userId: suspended, departmentId: inst.deptA1, role: 'ACADEMIC' });
    await addGrant(prisma, { userId: suspended, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
    const revoked = await createUser(prisma);
    await addMembership(prisma, { userId: revoked, departmentId: inst.deptA1, role: 'ACADEMIC' });
    await addGrant(prisma, {
      userId: revoked,
      scope: 'DEPARTMENT',
      departmentId: inst.deptA1,
      revoked: true,
    });

    expect(await codeOf(transition(userId, { admin: { userId: suspended } }))).toBe(
      'AUTH_ACCOUNT_SUSPENDED',
    );
    expect(await codeOf(transition(userId, { admin: { userId: revoked } }))).toBe('AUTH_FORBIDDEN');
    await expectUnchanged(userId, studentId);
  });

  it('doğrulanmamış üyeliği olan yönetici AUTH_NOT_VERIFIED', async () => {
    const { userId, studentId } = await newStudent();
    const unverified = await createUser(prisma);
    await addMembership(prisma, {
      userId: unverified,
      departmentId: inst.deptA1,
      role: 'ACADEMIC',
      status: 'PENDING',
    });
    await addGrant(prisma, { userId: unverified, scope: 'DEPARTMENT', departmentId: inst.deptA1 });

    expect(await codeOf(transition(userId, { admin: { userId: unverified } }))).toBe(
      'AUTH_NOT_VERIFIED',
    );
    await expectUnchanged(userId, studentId);
  });

  it.each([
    [
      'öğrenci üyeliği yok',
      async () => ({ userId: await createUser(prisma) }),
      'MEMBERSHIP_TRANSITION_INVALID',
    ],
    [
      'doğrulanmamış öğrenci',
      async () => {
        const userId = await createUser(prisma);
        await addMembership(prisma, {
          userId,
          departmentId: inst.deptA1,
          role: 'STUDENT',
          status: 'PENDING',
        });
        return { userId };
      },
      'MEMBERSHIP_TRANSITION_INVALID',
    ],
    [
      'üyeliği kapanmış öğrenci',
      async () => {
        const userId = await createUser(prisma);
        await addMembership(prisma, {
          userId,
          departmentId: inst.deptA1,
          role: 'STUDENT',
          endedAt: new Date('2026-01-01'),
        });
        return { userId };
      },
      'MEMBERSHIP_TRANSITION_INVALID',
    ],
    [
      'akademisyen',
      async () => {
        const userId = await createUser(prisma);
        await addMembership(prisma, { userId, departmentId: inst.deptA1, role: 'ACADEMIC' });
        return { userId };
      },
      'MEMBERSHIP_TRANSITION_INVALID',
    ],
    [
      'silinmiş kullanıcı',
      async () => {
        const userId = await createUser(prisma, { deletedAt: new Date('2026-10-01') });
        await addMembership(prisma, { userId, departmentId: inst.deptA1, role: 'STUDENT' });
        return { userId };
      },
      'RESOURCE_NOT_FOUND',
    ],
    ['var olmayan kullanıcı', async () => ({ userId: 'yok-yok' }), 'RESOURCE_NOT_FOUND'],
  ] as const)('geçersiz hedef: %s', async (_label, make, code) => {
    const { userId } = await make();
    expect(await codeOf(transition(userId))).toBe(code);
  });

  it('mezuniyet yılı giriş yılından önceyse geçiş reddedilir', async () => {
    const { userId, studentId } = await newStudent(2022);
    expect(await codeOf(transition(userId, { graduationYear: 2020 }))).toBe(
      'MEMBERSHIP_TRANSITION_INVALID',
    );
    await expectUnchanged(userId, studentId);
  });

  it('işlem kaydı reddedilirse (kişisel veri içeren gerekçe) geçiş de geri alınır', async () => {
    const { userId, studentId } = await newStudent();
    expect(await codeOf(transition(userId, { reason: 'ayse@ogr.iu.edu.tr listesi' }))).toBe(
      'AUDIT_REASON_INVALID',
    );
    await expectUnchanged(userId, studentId);
  });
});

// Tip düzeyinde: hata kodları kayıtlıdır
const _typecheck: ErrorCode = 'MEMBERSHIP_TRANSITION_INVALID';
void _typecheck;
