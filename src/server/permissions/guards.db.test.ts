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

import { createPermissions } from './guards';

const prisma = createTestPrisma();
let sessionUserId: string | null = null;

const permissions = createPermissions({
  db: () => prisma,
  getSessionUserId: async () => sessionUserId,
  now: () => new Date('2026-11-07T12:00:00Z'),
});

afterAll(() => prisma.$disconnect());

/** İşlev başarılıysa 'OK', CodedError ise kodu, başka hatada fırlatır. */
async function outcome(fn: () => Promise<unknown>): Promise<'OK' | ErrorCode> {
  try {
    await fn();
    return 'OK';
  } catch (error) {
    if (isCodedError(error)) return error.code;
    throw error;
  }
}

type Personas = Record<string, string | null>;
let inst: Institution;
let personas: Personas;

beforeAll(async () => {
  inst = await createInstitution(prisma);
  const p: Personas = {};

  // — Üyelik durumları —
  p.student = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.student,
    departmentId: inst.deptA1,
    role: 'STUDENT',
    entryYear: 2025,
  });

  p.unverifiedAlumni = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.unverifiedAlumni,
    departmentId: inst.deptA1,
    role: 'ALUMNI',
    status: 'PENDING',
  });

  p.rejectedAlumni = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.rejectedAlumni,
    departmentId: inst.deptA1,
    role: 'ALUMNI',
    status: 'REJECTED',
  });

  p.noMembership = await createUser(prisma);

  p.endedStudent = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.endedStudent,
    departmentId: inst.deptA1,
    role: 'STUDENT',
    endedAt: new Date('2026-06-30'),
  });

  // — Hesap durumları (hepsi doğrulanmış öğrenci) —
  p.suspended = await createUser(prisma, { banned: true });
  await addMembership(prisma, { userId: p.suspended, departmentId: inst.deptA1, role: 'STUDENT' });

  p.suspendedTemporarily = await createUser(prisma, {
    banned: true,
    banExpires: new Date('2026-12-01'),
  });
  await addMembership(prisma, {
    userId: p.suspendedTemporarily,
    departmentId: inst.deptA1,
    role: 'STUDENT',
  });

  p.suspensionExpired = await createUser(prisma, {
    banned: true,
    banExpires: new Date('2026-11-01'),
  });
  await addMembership(prisma, {
    userId: p.suspensionExpired,
    departmentId: inst.deptA1,
    role: 'STUDENT',
  });

  p.deleted = await createUser(prisma, { deletedAt: new Date('2026-10-01') });
  await addMembership(prisma, { userId: p.deleted, departmentId: inst.deptA1, role: 'STUDENT' });

  // — Mentorlar —
  p.mentor = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.mentor,
    departmentId: inst.deptA1,
    role: 'ALUMNI',
    graduationYear: 2022,
  });
  await addMentorProfile(prisma, p.mentor);

  p.inactiveMentor = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.inactiveMentor,
    departmentId: inst.deptA1,
    role: 'ALUMNI',
    graduationYear: 2022,
  });
  await addMentorProfile(prisma, p.inactiveMentor, { isActive: false });

  p.unverifiedMentor = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.unverifiedMentor,
    departmentId: inst.deptA1,
    role: 'ALUMNI',
    status: 'PENDING',
  });
  await addMentorProfile(prisma, p.unverifiedMentor);

  // — Yöneticiler (hepsi doğrulanmış akademisyen, aksi belirtilmedikçe) —
  p.deptAdminA1 = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.deptAdminA1,
    departmentId: inst.deptA1,
    role: 'ACADEMIC',
  });
  await addGrant(prisma, { userId: p.deptAdminA1, scope: 'DEPARTMENT', departmentId: inst.deptA1 });

  p.deptAdminA2 = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.deptAdminA2,
    departmentId: inst.deptA2,
    role: 'ACADEMIC',
  });
  await addGrant(prisma, { userId: p.deptAdminA2, scope: 'DEPARTMENT', departmentId: inst.deptA2 });

  p.deptAdminB1 = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.deptAdminB1,
    departmentId: inst.deptB1,
    role: 'ACADEMIC',
  });
  await addGrant(prisma, { userId: p.deptAdminB1, scope: 'DEPARTMENT', departmentId: inst.deptB1 });

  p.facultyAdminA = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.facultyAdminA,
    departmentId: inst.deptA1,
    role: 'ACADEMIC',
  });
  await addGrant(prisma, { userId: p.facultyAdminA, scope: 'FACULTY', facultyId: inst.facultyA });

  p.systemAdmin = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.systemAdmin,
    departmentId: inst.deptA1,
    role: 'ACADEMIC',
  });
  await addGrant(prisma, { userId: p.systemAdmin, scope: 'SYSTEM' });

  p.revokedAdmin = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.revokedAdmin,
    departmentId: inst.deptA1,
    role: 'ACADEMIC',
  });
  await addGrant(prisma, {
    userId: p.revokedAdmin,
    scope: 'DEPARTMENT',
    departmentId: inst.deptA1,
    revoked: true,
  });

  p.suspendedAdmin = await createUser(prisma, { banned: true });
  await addMembership(prisma, {
    userId: p.suspendedAdmin,
    departmentId: inst.deptA1,
    role: 'ACADEMIC',
  });
  await addGrant(prisma, { userId: p.suspendedAdmin, scope: 'SYSTEM' });

  p.unverifiedAdmin = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.unverifiedAdmin,
    departmentId: inst.deptA1,
    role: 'ACADEMIC',
    status: 'PENDING',
  });
  await addGrant(prisma, {
    userId: p.unverifiedAdmin,
    scope: 'DEPARTMENT',
    departmentId: inst.deptA1,
  });

  p.adminWithoutMembership = await createUser(prisma);
  await addGrant(prisma, { userId: p.adminWithoutMembership, scope: 'SYSTEM' });

  // — Çoklu rol: A1'de öğrenci, B1'de doğrulanmış mezun —
  p.multiRole = await createUser(prisma);
  await addMembership(prisma, {
    userId: p.multiRole,
    departmentId: inst.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await addMembership(prisma, {
    userId: p.multiRole,
    departmentId: inst.deptB1,
    role: 'ALUMNI',
    graduationYear: 2023,
  });

  // — Oturum var ama kullanıcı satırı yok —
  p.vanished = 'kullanici-yok-000';
  // — Oturum yok —
  p.anonymous = null;

  personas = p;
});

async function as<T>(persona: string, fn: () => Promise<T>): Promise<T> {
  sessionUserId = personas[persona] ?? null;
  return fn();
}

// ---------------------------------------------------------------------------------------------
// Koruma × kişi tablosu. Sonuç: 'OK' ya da kararlı hata kodu.
//   U=AUTH_UNAUTHENTICATED  S=AUTH_ACCOUNT_SUSPENDED  V=AUTH_NOT_VERIFIED  F=AUTH_FORBIDDEN
// ---------------------------------------------------------------------------------------------
const CODE: Record<string, 'OK' | ErrorCode> = {
  OK: 'OK',
  U: 'AUTH_UNAUTHENTICATED',
  S: 'AUTH_ACCOUNT_SUSPENDED',
  V: 'AUTH_NOT_VERIFIED',
  F: 'AUTH_FORBIDDEN',
};

describe('requireUser', () => {
  it.each([
    ['student', 'OK'],
    ['unverifiedAlumni', 'OK'],
    ['noMembership', 'OK'],
    ['endedStudent', 'OK'],
    ['suspensionExpired', 'OK'],
    ['deptAdminA1', 'OK'],
    ['anonymous', 'U'],
    ['vanished', 'U'],
    ['deleted', 'U'],
    ['suspended', 'S'],
    ['suspendedTemporarily', 'S'],
    ['suspendedAdmin', 'S'],
  ] as const)('%s → %s', async (persona, expected) => {
    expect(await as(persona, () => outcome(() => permissions.requireUser()))).toBe(CODE[expected]);
  });

  it('başarılı çağrı yalnız kimlik ve olguları döner (kişisel alan yok)', async () => {
    const actor = await as('student', () => permissions.requireUser());
    expect(actor.userId).toBe(personas.student);
    expect(Object.keys(actor).sort()).toEqual(['facts', 'userId']);
    expect(JSON.stringify(actor)).not.toMatch(/@|email|name/i);
  });
});

describe('requireVerifiedMember', () => {
  it.each([
    ['student', 'OK'],
    ['mentor', 'OK'],
    ['multiRole', 'OK'],
    ['deptAdminA1', 'OK'],
    ['unverifiedAlumni', 'V'],
    ['rejectedAlumni', 'V'],
    ['noMembership', 'V'],
    ['endedStudent', 'V'],
    ['anonymous', 'U'],
    ['deleted', 'U'],
    ['suspended', 'S'],
  ] as const)('%s → %s', async (persona, expected) => {
    expect(await as(persona, () => outcome(() => permissions.requireVerifiedMember()))).toBe(
      CODE[expected],
    );
  });

  it('bölüm şartı: yalnız o bölümde doğrulanmış üyelik geçer', async () => {
    const inA1 = () => permissions.requireVerifiedMember({ departmentId: inst.deptA1 });
    const inB1 = () => permissions.requireVerifiedMember({ departmentId: inst.deptB1 });
    expect(await as('student', () => outcome(inA1))).toBe('OK');
    expect(await as('student', () => outcome(inB1))).toBe('AUTH_FORBIDDEN');
    expect(await as('multiRole', () => outcome(inB1))).toBe('OK');
  });

  it('rol şartı: çoklu rolde ilgili rol varsa geçer, yoksa AUTH_FORBIDDEN', async () => {
    const alumniOnly = () => permissions.requireVerifiedMember({ roles: ['ALUMNI'] });
    const academicOnly = () => permissions.requireVerifiedMember({ roles: ['ACADEMIC'] });
    expect(await as('multiRole', () => outcome(alumniOnly))).toBe('OK');
    expect(await as('multiRole', () => outcome(academicOnly))).toBe('AUTH_FORBIDDEN');
    expect(await as('student', () => outcome(alumniOnly))).toBe('AUTH_FORBIDDEN');
  });

  it('bölüm VE rol birlikte aranır: başka bölümdeki rol sayılmaz', async () => {
    const alumniInA1 = () =>
      permissions.requireVerifiedMember({ departmentId: inst.deptA1, roles: ['ALUMNI'] });
    // multiRole: A1'de öğrenci, B1'de mezun → A1'de mezun değil
    expect(await as('multiRole', () => outcome(alumniInA1))).toBe('AUTH_FORBIDDEN');
  });
});

describe('requireMentor', () => {
  it.each([
    ['mentor', 'OK'],
    ['inactiveMentor', 'F'],
    ['student', 'F'],
    ['deptAdminA1', 'F'],
    ['unverifiedMentor', 'V'],
    ['noMembership', 'V'],
    ['anonymous', 'U'],
    ['deleted', 'U'],
    ['suspended', 'S'],
  ] as const)('%s → %s', async (persona, expected) => {
    expect(await as(persona, () => outcome(() => permissions.requireMentor()))).toBe(
      CODE[expected],
    );
  });
});

describe('requireAdmin / requireModerator', () => {
  const dept = (id: () => string) => () =>
    permissions.requireAdmin({ kind: 'DEPARTMENT', departmentId: id() });
  const faculty = (id: () => string) => () =>
    permissions.requireAdmin({ kind: 'FACULTY', facultyId: id() });
  const system = () => permissions.requireAdmin({ kind: 'SYSTEM' });

  // [kişi, A1, A2, B1, fakülte A, fakülte B, sistem]
  it.each([
    ['deptAdminA1', 'OK', 'F', 'F', 'F', 'F', 'F'],
    ['deptAdminA2', 'F', 'OK', 'F', 'F', 'F', 'F'],
    ['deptAdminB1', 'F', 'F', 'OK', 'F', 'F', 'F'],
    ['facultyAdminA', 'OK', 'OK', 'F', 'OK', 'F', 'F'],
    ['systemAdmin', 'OK', 'OK', 'OK', 'OK', 'OK', 'OK'],
    ['revokedAdmin', 'F', 'F', 'F', 'F', 'F', 'F'],
    ['student', 'F', 'F', 'F', 'F', 'F', 'F'],
    ['mentor', 'F', 'F', 'F', 'F', 'F', 'F'],
    ['unverifiedAlumni', 'F', 'F', 'F', 'F', 'F', 'F'],
    ['noMembership', 'F', 'F', 'F', 'F', 'F', 'F'],
    ['unverifiedAdmin', 'V', 'F', 'F', 'F', 'F', 'F'],
    ['adminWithoutMembership', 'V', 'V', 'V', 'V', 'V', 'V'],
    ['suspendedAdmin', 'S', 'S', 'S', 'S', 'S', 'S'],
    ['deleted', 'U', 'U', 'U', 'U', 'U', 'U'],
    ['anonymous', 'U', 'U', 'U', 'U', 'U', 'U'],
    ['vanished', 'U', 'U', 'U', 'U', 'U', 'U'],
  ] as const)(
    '%s → A1:%s A2:%s B1:%s fakA:%s fakB:%s sistem:%s',
    async (persona, a1, a2, b1, fa, fb, sys) => {
      const run = (guard: () => Promise<unknown>) => as(persona, () => outcome(guard));
      expect(await run(dept(() => inst.deptA1))).toBe(CODE[a1]);
      expect(await run(dept(() => inst.deptA2))).toBe(CODE[a2]);
      expect(await run(dept(() => inst.deptB1))).toBe(CODE[b1]);
      expect(await run(faculty(() => inst.facultyA))).toBe(CODE[fa]);
      expect(await run(faculty(() => inst.facultyB))).toBe(CODE[fb]);
      expect(await run(system)).toBe(CODE[sys]);
    },
  );

  it.each([
    ['deptAdminA1', 'OK'],
    ['deptAdminA2', 'OK'],
    ['facultyAdminA', 'OK'],
    ['systemAdmin', 'OK'],
    ['revokedAdmin', 'F'],
    ['student', 'F'],
    ['mentor', 'F'],
    ['noMembership', 'F'],
    ['unverifiedAdmin', 'V'],
    ['adminWithoutMembership', 'V'],
    ['suspendedAdmin', 'S'],
    ['deleted', 'U'],
    ['anonymous', 'U'],
    ['vanished', 'U'],
  ] as const)('requireAnyAdmin: %s → %s', async (persona, expected) => {
    expect(await as(persona, () => outcome(() => permissions.requireAnyAdmin()))).toBe(
      CODE[expected],
    );
  });

  it('var olmayan bölüm, yetkisiz kullanıcının aldığı yanıtın aynısını verir (kimlik avı yok)', async () => {
    const missing = () => permissions.requireAdmin({ kind: 'DEPARTMENT', departmentId: 'yok-yok' });
    const uncovered = () =>
      permissions.requireAdmin({ kind: 'DEPARTMENT', departmentId: inst.deptB1 });
    for (const persona of ['deptAdminA1', 'student', 'systemAdmin']) {
      const outcomeMissing = await as(persona, () => outcome(missing));
      expect(outcomeMissing).toBe('AUTH_FORBIDDEN');
    }
    expect(await as('deptAdminA1', () => outcome(uncovered))).toBe('AUTH_FORBIDDEN');
  });

  it('oturumsuz kullanıcı var olmayan bölümde de AUTH_UNAUTHENTICATED alır (kapsam çözümlenmeden)', async () => {
    const missing = () => permissions.requireAdmin({ kind: 'DEPARTMENT', departmentId: 'yok-yok' });
    expect(await as('anonymous', () => outcome(missing))).toBe('AUTH_UNAUTHENTICATED');
  });

  it('requireModerator bölüm yöneticisini yalnız kendi bölümünde geçirir', async () => {
    const mod = (id: string) => () => permissions.requireModerator(id);
    expect(await as('deptAdminA1', () => outcome(mod(inst.deptA1)))).toBe('OK');
    expect(await as('deptAdminA1', () => outcome(mod(inst.deptA2)))).toBe('AUTH_FORBIDDEN');
    expect(await as('facultyAdminA', () => outcome(mod(inst.deptA2)))).toBe('OK');
    expect(await as('facultyAdminA', () => outcome(mod(inst.deptB1)))).toBe('AUTH_FORBIDDEN');
  });

  it('hatalar doğru HTTP türünü taşır: oturumsuz 401, yetkisiz/askıda/doğrulanmamış 403', async () => {
    const statusOf = async (persona: string) => {
      try {
        await as(persona, () => permissions.requireAdmin({ kind: 'SYSTEM' }));
      } catch (error) {
        return isCodedError(error) ? error.status : -1;
      }
      return 200;
    };
    expect(await statusOf('anonymous')).toBe(401);
    expect(await statusOf('student')).toBe(403);
    expect(await statusOf('suspendedAdmin')).toBe(403);
    expect(await statusOf('adminWithoutMembership')).toBe(403);
    expect(await statusOf('systemAdmin')).toBe(200);
  });
});

describe('canModerate ve managedDepartmentIds', () => {
  it('canModerate içerik bölümüne göre karar verir (yazıldığı andaki bölüm)', async () => {
    const actorA1 = await as('deptAdminA1', () => permissions.requireUser());
    expect(await permissions.canModerate(actorA1, inst.deptA1)).toBe(true);
    expect(await permissions.canModerate(actorA1, inst.deptA2)).toBe(false);
    expect(await permissions.canModerate(actorA1, inst.deptB1)).toBe(false);
    expect(await permissions.canModerate(actorA1, 'yok-yok')).toBe(false);

    const actorFaculty = await as('facultyAdminA', () => permissions.requireUser());
    expect(await permissions.canModerate(actorFaculty, inst.deptA2)).toBe(true);
    expect(await permissions.canModerate(actorFaculty, inst.deptB1)).toBe(false);
  });

  it('yetkisiz kullanıcı hiçbir bölümü yönetemez', async () => {
    const student = await as('student', () => permissions.requireUser());
    expect(await permissions.canModerate(student, inst.deptA1)).toBe(false);
    expect(await permissions.managedDepartmentIds(student)).toEqual([]);
  });

  it('managedDepartmentIds: bölüm yöneticisi yalnız kendi bölümünü, fakülte yöneticisi fakültesini görür', async () => {
    const dept = await as('deptAdminA1', () => permissions.requireUser());
    expect(await permissions.managedDepartmentIds(dept)).toEqual([inst.deptA1]);

    const faculty = await as('facultyAdminA', () => permissions.requireUser());
    expect((await permissions.managedDepartmentIds(faculty)).sort()).toEqual(
      [inst.deptA1, inst.deptA2].sort(),
    );

    const other = await as('deptAdminB1', () => permissions.requireUser());
    expect(await permissions.managedDepartmentIds(other)).toEqual([inst.deptB1]);
  });

  it('sistem yöneticisi bütün bölümleri görür (diğer fixture kurumları dahil)', async () => {
    const system = await as('systemAdmin', () => permissions.requireUser());
    const ids = await permissions.managedDepartmentIds(system);
    expect(ids).toEqual(expect.arrayContaining([inst.deptA1, inst.deptA2, inst.deptB1]));
  });

  it('yetkisi kaldırılmış, doğrulanmamış ya da askıdaki yönetici kapsam göremez', async () => {
    for (const persona of ['revokedAdmin', 'unverifiedAdmin', 'adminWithoutMembership']) {
      const actor = await as(persona, () => permissions.requireUser());
      expect(await permissions.managedDepartmentIds(actor), persona).toEqual([]);
    }
  });
});

describe('istemci girdisi yetki kararında kullanılmaz', () => {
  it('korumalar rol/kimlik parametresi almaz; karar yalnız oturumdaki kullanıcıya bağlıdır', async () => {
    // Aynı çağrı, oturumdaki kişiye göre farklı sonuç verir; çağırana rol söyletmenin yolu yoktur.
    const guard = () => permissions.requireAdmin({ kind: 'SYSTEM' });
    expect(await as('systemAdmin', () => outcome(guard))).toBe('OK');
    expect(await as('student', () => outcome(guard))).toBe('AUTH_FORBIDDEN');
    expect(permissions.requireUser.length).toBe(0);
    expect(permissions.requireMentor.length).toBe(0);
  });

  it('oturum çözümlenemezse (null) her koruma AUTH_UNAUTHENTICATED verir', async () => {
    sessionUserId = null;
    for (const guard of [
      () => permissions.requireUser(),
      () => permissions.requireVerifiedMember(),
      () => permissions.requireMentor(),
      () => permissions.requireAdmin({ kind: 'SYSTEM' }),
      () => permissions.requireModerator(inst.deptA1),
    ]) {
      expect(await outcome(guard)).toBe('AUTH_UNAUTHENTICATED');
    }
  });
});
