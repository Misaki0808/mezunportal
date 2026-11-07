import { afterAll, describe, expect, it } from 'vitest';

import { isCodedError } from '../src/lib/errors';
import { createPermissions } from '../src/server/permissions/guards';
import { computeClassStanding, isUpperClass } from '../src/server/rules/classYear';
import { createTestPrisma } from '../src/test/db';
import {
  INSTITUTION_SEED,
  TEST_EMAIL_DOMAIN,
  TEST_PERSONAS,
  type TestPersonaKey,
} from './seed-data';
import { seedAccounts, seedUserId } from './seed-accounts';
import { TEST_ACCOUNT_PLACEHOLDERS } from './seed-framework';
import { seedInstitutions } from './seed-institutions';

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

const NOW = new Date('2026-11-07T12:00:00+03:00');
const personaEmails = Object.values(TEST_PERSONAS).map((persona) => persona.email);

async function seedAll() {
  await seedInstitutions(prisma);
  await seedAccounts(prisma);
}

async function counts() {
  const userIds = (Object.keys(TEST_PERSONAS) as TestPersonaKey[]).map(seedUserId);
  return {
    users: await prisma.user.count({ where: { email: { in: personaEmails } } }),
    memberships: await prisma.membership.count({ where: { userId: { in: userIds } } }),
    grants: await prisma.adminGrant.count({ where: { userId: { in: userIds } } }),
    mentors: await prisma.mentorProfile.count({ where: { userId: { in: userIds } } }),
  };
}

describe('seedAccounts', () => {
  it('altı rol için kullanıcı, doğrulanmış üyelik, mentor profili ve yetki yazar', async () => {
    await seedAll();

    expect(await counts()).toEqual({ users: 6, memberships: 6, grants: 2, mentors: 2 });
    const memberships = await prisma.membership.findMany({
      where: { user: { email: { in: personaEmails } } },
      select: {
        role: true,
        verificationStatus: true,
        endedAt: true,
        department: { select: { code: true } },
      },
    });
    expect(
      memberships.every((m) => m.verificationStatus === 'VERIFIED' && m.endedAt === null),
    ).toBe(true);
    expect(memberships.every((m) => m.department.code === INSTITUTION_SEED.department.code)).toBe(
      true,
    );
    expect(memberships.map((m) => m.role).sort()).toEqual([
      'ACADEMIC',
      'ACADEMIC',
      'ACADEMIC',
      'ALUMNI',
      'STUDENT',
      'STUDENT',
    ]);
  });

  it('iki kez çalışınca çift kayıt üretmez ve kimlikler aynı kalır', async () => {
    await seedAll();
    const before = await prisma.user.findMany({
      where: { email: { in: personaEmails } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    await seedAll();
    const after = await prisma.user.findMany({
      where: { email: { in: personaEmails } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    expect(await counts()).toEqual({ users: 6, memberships: 6, grants: 2, mentors: 2 });
    expect(after).toEqual(before);
  });

  it('bozulmuş kullanıcı ve üyelik sabitlerle yeniden eşitlenir (askı kalkar, doğrulama geri gelir)', async () => {
    await seedAll();
    const id = seedUserId('student');
    await prisma.user.update({ where: { id }, data: { banned: true, name: 'Bozuk' } });
    await prisma.membership.updateMany({
      where: { userId: id },
      data: { verificationStatus: 'PENDING', verifiedAt: null },
    });

    await seedAccounts(prisma);

    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user).toMatchObject({ banned: false, name: TEST_PERSONAS.student.name });
    expect(
      await prisma.membership.count({ where: { userId: id, verificationStatus: 'VERIFIED' } }),
    ).toBe(1);
  });

  it('e-postalar gerçek alan adında değil, test alan adındadır; yer tutucu anahtarlarla eşleşir', () => {
    for (const email of personaEmails) {
      expect(email.endsWith(`@${TEST_EMAIL_DOMAIN}`)).toBe(true);
      expect(email).not.toMatch(/iu\.edu\.tr|istanbul\.edu\.tr/);
    }
    expect(Object.keys(TEST_PERSONAS).sort()).toEqual([...TEST_ACCOUNT_PLACEHOLDERS].sort());
  });

  it('sınıf: öğrenci 1. sınıf (üst sınıf değil), üst sınıf mentor 4. sınıf (üst sınıf)', () => {
    const student = computeClassStanding({ entryYear: TEST_PERSONAS.student.entryYear }, NOW);
    const senior = computeClassStanding({ entryYear: TEST_PERSONAS.seniorMentor.entryYear }, NOW);
    expect(student).toEqual({ kind: 'GRADE', grade: 1, extended: false });
    expect(isUpperClass(student)).toBe(false);
    expect(senior).toEqual({ kind: 'GRADE', grade: 4, extended: false });
    expect(isUpperClass(senior)).toBe(true);
  });
});

describe('seed kullanıcıları yetki korumalarından beklenen sonucu alır', () => {
  let current: TestPersonaKey | null = null;
  const permissions = createPermissions({
    db: () => prisma,
    getSessionUserId: async () => (current ? seedUserId(current) : null),
    now: () => NOW,
  });
  const ok = async (persona: TestPersonaKey, guard: () => Promise<unknown>) => {
    current = persona;
    try {
      await guard();
      return true;
    } catch (error) {
      if (isCodedError(error)) return false;
      throw error;
    }
  };

  it('kullanıcı/üye/mentor/yönetici ayrımı', async () => {
    await seedAll();
    const department = await prisma.department.findFirstOrThrow({
      where: {
        code: INSTITUTION_SEED.department.code,
        faculty: { name: INSTITUTION_SEED.faculty.name },
      },
      select: { id: true },
    });
    const member = () => permissions.requireVerifiedMember();
    const mentor = () => permissions.requireMentor();
    const deptAdmin = () =>
      permissions.requireAdmin({ kind: 'DEPARTMENT', departmentId: department.id });
    const sysAdmin = () => permissions.requireAdmin({ kind: 'SYSTEM' });

    const table: Record<TestPersonaKey, [boolean, boolean, boolean, boolean]> = {
      //                  üye    mentor bölüm  sistem
      student: [true, false, false, false],
      seniorMentor: [true, true, false, false],
      alumniMentor: [true, true, false, false],
      academic: [true, false, false, false],
      departmentAdmin: [true, false, true, false],
      systemAdmin: [true, false, true, true],
    };
    for (const [persona, expected] of Object.entries(table) as [TestPersonaKey, boolean[]][]) {
      expect(
        [
          await ok(persona, member),
          await ok(persona, mentor),
          await ok(persona, deptAdmin),
          await ok(persona, sysAdmin),
        ],
        persona,
      ).toEqual(expected);
    }
  });
});
