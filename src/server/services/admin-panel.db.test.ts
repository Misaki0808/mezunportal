import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  addMentorProfile,
  createInstitution,
  createUser,
  grantRequiredConsents,
  type Institution,
} from '@/test/fixtures';

import {
  getAdminOverview,
  getUserDetail,
  listAdminGrants,
  listAdminReports,
  listAuditLog,
  searchUsers,
} from './admin-panel';
import { recordAdminAction } from './audit';
import * as experiences from './experience';

const db = createTestPrisma();
const deps = { db };
afterAll(() => db.$disconnect());

let inst: Institution;
let other: Institution;
const admins = {} as Record<'deptA1' | 'deptB1' | 'facultyA' | 'system', string>;

async function adminOf(
  scope: 'DEPARTMENT' | 'FACULTY' | 'SYSTEM',
  departmentId: string,
  grant: { departmentId?: string; facultyId?: string } = {},
) {
  const userId = await createUser(db);
  await addMembership(db, { userId, departmentId, role: 'ACADEMIC' });
  await addGrant(db, { userId, scope, ...grant });
  await grantRequiredConsents(db, userId);
  return userId;
}

beforeAll(async () => {
  inst = await createInstitution(db);
  other = await createInstitution(db);
  admins.deptA1 = await adminOf('DEPARTMENT', inst.deptA1, { departmentId: inst.deptA1 });
  admins.deptB1 = await adminOf('DEPARTMENT', inst.deptB1, { departmentId: inst.deptB1 });
  admins.facultyA = await adminOf('FACULTY', inst.deptA1, { facultyId: inst.facultyA });
  admins.system = await adminOf('SYSTEM', inst.deptA1);
});

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(isCodedError(error), `kodlu hata bekleniyordu (${code}); gelen: ${String(error)}`).toBe(
    true,
  );
  expect(isCodedError(error) && error.code).toBe(code);
}

const tag = () => `zx${randomUUID().replace(/-/g, '').slice(0, 10)}`;
type NewUser = {
  departmentId?: string;
  role?: 'STUDENT' | 'ALUMNI' | 'ACADEMIC';
  status?: 'PENDING' | 'VERIFIED' | 'REJECTED';
  name?: string;
  phone?: string;
  email?: string;
  banned?: boolean;
  banExpires?: Date | null;
  deletedAt?: Date | null;
};
async function person(input: NewUser = {}) {
  const userId = await createUser(db, {
    name: input.name ?? `Kişi ${tag()}`,
    ...(input.email ? { email: input.email } : {}),
    banned: input.banned ?? false,
    banExpires: input.banExpires ?? null,
    deletedAt: input.deletedAt ?? null,
  });
  if (input.phone) await db.user.update({ where: { id: userId }, data: { phone: input.phone } });
  if (input.departmentId) {
    await addMembership(db, {
      userId,
      departmentId: input.departmentId,
      role: input.role ?? 'STUDENT',
      status: input.status ?? 'VERIFIED',
      ...(input.role === 'ALUMNI' ? { graduationYear: 2022 } : { entryYear: 2023 }),
    });
  }
  return userId;
}
const ids = (page: { items: { id: string }[] }) => page.items.map((item) => item.id);

// =============================================================================================
// Erişim: kapı herkese aynı davranır
// =============================================================================================
describe('yetki kapısı', () => {
  it('yönetici olmayan, doğrulanmamış, askıdaki ve yetkisi kaldırılmış kullanıcı hiçbir sorguyu çalıştıramaz', async () => {
    const plain = await person({ departmentId: inst.deptA1 });
    const unverified = await createUser(db);
    await addMembership(db, {
      userId: unverified,
      departmentId: inst.deptA1,
      role: 'ACADEMIC',
      status: 'PENDING',
    });
    await addGrant(db, { userId: unverified, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
    const suspended = await adminOf('DEPARTMENT', inst.deptA1, { departmentId: inst.deptA1 });
    await db.user.update({ where: { id: suspended }, data: { banned: true } });
    const revoked = await createUser(db);
    await addMembership(db, { userId: revoked, departmentId: inst.deptA1, role: 'ACADEMIC' });
    await addGrant(db, {
      userId: revoked,
      scope: 'DEPARTMENT',
      departmentId: inst.deptA1,
      revoked: true,
    });
    const deleted = await adminOf('DEPARTMENT', inst.deptA1, { departmentId: inst.deptA1 });
    await db.user.update({ where: { id: deleted }, data: { deletedAt: new Date() } });

    const cases: [string, string][] = [
      [plain, 'AUTH_FORBIDDEN'],
      [unverified, 'AUTH_NOT_VERIFIED'],
      [suspended, 'AUTH_ACCOUNT_SUSPENDED'],
      [revoked, 'AUTH_FORBIDDEN'],
      [deleted, 'AUTH_UNAUTHENTICATED'],
      [randomUUID(), 'AUTH_UNAUTHENTICATED'],
    ];
    for (const [userId, code] of cases) {
      await expectCode(getAdminOverview(deps, userId), code);
      await expectCode(searchUsers(deps, userId, {}), code);
      await expectCode(getUserDetail(deps, userId, { userId: plain }), code);
      await expectCode(listAdminReports(deps, userId, {}), code);
    }
  });

  it('sistem yöneticisine özel sorgular bölüm/fakülte yöneticisine kapalıdır', async () => {
    for (const adminId of [admins.deptA1, admins.facultyA]) {
      await expectCode(listAdminGrants(deps, adminId, {}), 'AUTH_FORBIDDEN');
      await expectCode(listAuditLog(deps, adminId, {}), 'AUTH_FORBIDDEN');
    }
  });
});

// =============================================================================================
// Genel bakış
// =============================================================================================
describe('getAdminOverview', () => {
  it('düzey, kapsamdaki bölümler ve yetenekler yetkiden gelir', async () => {
    const dept = await getAdminOverview(deps, admins.deptA1);
    expect(dept.level).toBe('DEPARTMENT');
    expect(dept.departments.map((department) => department.id)).toEqual([inst.deptA1]);
    expect(dept.capabilities).toEqual({
      users: true,
      reports: true,
      employmentReport: true,
      dictionaries: false,
      unmatchedValues: false,
      adminGrants: false,
      auditLog: false,
    });
    expect(dept.counts.openUnmatchedValues).toBeNull();

    const faculty = await getAdminOverview(deps, admins.facultyA);
    expect(faculty.level).toBe('FACULTY');
    expect(faculty.departments.map((department) => department.id).sort()).toEqual(
      [inst.deptA1, inst.deptA2].sort(),
    );

    const system = await getAdminOverview(deps, admins.system);
    expect(system.level).toBe('SYSTEM');
    expect(system.capabilities).toMatchObject({ dictionaries: true, auditLog: true });
    expect(system.counts.openUnmatchedValues).toBeGreaterThanOrEqual(0);
    expect(system.departments.map((department) => department.id)).toEqual(
      expect.arrayContaining([inst.deptA1, inst.deptB1, other.deptA1]),
    );
  });

  it('bekleyen iş sayıları yalnız kendi kapsamındakileri sayar', async () => {
    const scopeA = await createInstitution(db);
    const adminA = await adminOf('DEPARTMENT', scopeA.deptA1, { departmentId: scopeA.deptA1 });
    const before = await getAdminOverview(deps, adminA);

    // Kapsam içi: bekleyen belge, askıdaki kullanıcı. Kapsam dışı (B1): aynıları — sayılmamalı.
    for (const departmentId of [scopeA.deptA1, scopeA.deptB1]) {
      const applicant = await person({ departmentId, role: 'STUDENT' });
      await db.graduationDocument.create({
        data: {
          userId: applicant,
          departmentId,
          graduationYear: 2025,
          storageKey: `graduation/${applicant}/${randomUUID()}.pdf`,
        },
      });
      await person({ departmentId, banned: true });
    }
    // Süresi dolmuş askı sayılmaz.
    await person({
      departmentId: scopeA.deptA1,
      banned: true,
      banExpires: new Date(Date.now() - 1000),
    });
    const after = await getAdminOverview(deps, adminA);
    expect(after.counts.pendingGraduationDocuments - before.counts.pendingGraduationDocuments).toBe(
      1,
    );
    expect(after.counts.suspendedUsers - before.counts.suspendedUsers).toBe(1);
  });
});

// =============================================================================================
// Kullanıcı arama ve ayrıntı
// =============================================================================================
describe('searchUsers', () => {
  it('yönetici yalnız kendi kapsamındaki kullanıcıları görür; kapsam dışı ve üyeliksiz kullanıcı hiç çıkmaz', async () => {
    const mine = await person({ departmentId: inst.deptA1 });
    const sibling = await person({ departmentId: inst.deptA2 });
    const outsider = await person({ departmentId: inst.deptB1 });
    const foreign = await person({ departmentId: other.deptA1 });
    const orphan = await person();
    const closedOnly = await createUser(db);
    await addMembership(db, {
      userId: closedOnly,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2019,
      endedAt: new Date('2023-01-01'),
    });

    const dept = ids(await searchUsers(deps, admins.deptA1, { limit: 50 }));
    expect(dept).toContain(mine);
    for (const hidden of [sibling, outsider, foreign, orphan, closedOnly]) {
      expect(dept).not.toContain(hidden);
    }

    const faculty = ids(await searchUsers(deps, admins.facultyA, { limit: 50 }));
    expect(faculty).toEqual(expect.arrayContaining([mine, sibling]));
    expect(faculty).not.toContain(outsider);

    const system = ids(await searchUsers(deps, admins.system, { limit: 50, query: 'Kişi' }));
    expect(system).toEqual(expect.arrayContaining([mine, sibling, outsider, foreign, orphan]));
  });

  it('süzgeçler yetki vermez: kapsam dışı bölüm kimliği boş sonuç verir', async () => {
    await person({ departmentId: inst.deptB1 });
    expect((await searchUsers(deps, admins.deptA1, { departmentId: inst.deptB1 })).items).toEqual(
      [],
    );
    expect((await searchUsers(deps, admins.deptA1, { departmentId: other.deptA1 })).items).toEqual(
      [],
    );
    const own = await person({ departmentId: inst.deptA1 });
    expect(
      ids(await searchUsers(deps, admins.deptA1, { departmentId: inst.deptA1, limit: 50 })),
    ).toContain(own);
  });

  it('telefon ve e-posta çıktıda YALNIZ maskelidir (ham değer hiçbir yerde yok)', async () => {
    const email = `${tag()}@ogr.ornek-uni.edu.tr`;
    const phone = '0532 123 45 67';
    const userId = await person({ departmentId: inst.deptA1, email, phone });
    const page = await searchUsers(deps, admins.deptA1, { query: email.slice(0, 12), limit: 50 });
    const item = page.items.find((candidate) => candidate.id === userId)!;
    expect(item.maskedEmail).toMatch(/^[^@*]\*{3}@/);
    expect(item.maskedPhone).toBe('*** *** ** 67');
    const text =
      JSON.stringify(page) + JSON.stringify(await getUserDetail(deps, admins.deptA1, { userId }));
    expect(text).not.toContain(email);
    expect(text).not.toContain(email.split('@')[0]!);
    expect(text).not.toContain('0532');
    expect(text).not.toContain('123 45');
    expect(item).not.toHaveProperty('email');
    expect(item).not.toHaveProperty('phone');
  });

  it('telefonu olmayan kullanıcıda maskedPhone null', async () => {
    const userId = await person({ departmentId: inst.deptA1 });
    const item = (await searchUsers(deps, admins.deptA1, { limit: 50 })).items.find(
      (candidate) => candidate.id === userId,
    )!;
    expect(item.maskedPhone).toBeNull();
  });

  it('ad/e-postada büyük-küçük harf duyarsız arar; silinmiş hesap çıkmaz', async () => {
    const marker = tag();
    const found = await person({ departmentId: inst.deptA1, name: `Ayşe ${marker}` });
    await person({ departmentId: inst.deptA1, name: `Ayşe ${marker}`, deletedAt: new Date() });
    const byName = await searchUsers(deps, admins.deptA1, { query: marker.toUpperCase() });
    expect(ids(byName)).toEqual([found]);
    const byEmail = await searchUsers(deps, admins.deptA1, {
      query: (await db.user.findUniqueOrThrow({ where: { id: found } })).email.toUpperCase(),
    });
    expect(ids(byEmail)).toEqual([found]);
  });

  it('LIKE özel karakterleri düz metin sayılır: literal % ve _ içeren ad bulunur, joker gibi davranmaz', async () => {
    const marker = tag();
    const percent = await person({ departmentId: inst.deptA1, name: `Yüzde%100 ${marker}` });
    const underscore = await person({ departmentId: inst.deptA1, name: `Alt_çizgi ${marker}` });
    const plain = await person({ departmentId: inst.deptA1, name: `Altxçizgi ${marker}` });
    expect(ids(await searchUsers(deps, admins.deptA1, { query: `%100 ${marker}` }))).toEqual([
      percent,
    ]);
    expect(ids(await searchUsers(deps, admins.deptA1, { query: `Alt_çizgi ${marker}` }))).toEqual([
      underscore,
    ]);
    expect(
      ids(await searchUsers(deps, admins.deptA1, { query: `Alt_çizgi ${marker}`, limit: 50 })),
    ).not.toContain(plain);
    expect((await searchUsers(deps, admins.deptA1, { query: `\\${marker}` })).items).toEqual([]);
  });

  it('LIKE özel karakterleri sorguyu genişletmez', async () => {
    await person({ departmentId: inst.deptA1, name: `Yüzde ${tag()}` });
    expect((await searchUsers(deps, admins.deptA1, { query: '%%' })).items).toEqual([]);
    expect((await searchUsers(deps, admins.deptA1, { query: '__' })).items).toEqual([]);
  });

  it('rol, doğrulama ve durum süzgeçleri; süresi dolmuş askı ACTIVE sayılır', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope.deptA1, { departmentId: scope.deptA1 });
    const student = await person({ departmentId: scope.deptA1, role: 'STUDENT' });
    const alumni = await person({ departmentId: scope.deptA1, role: 'ALUMNI' });
    const pending = await person({ departmentId: scope.deptA1, role: 'ALUMNI', status: 'PENDING' });
    const banned = await person({ departmentId: scope.deptA1, banned: true });
    const expired = await person({
      departmentId: scope.deptA1,
      banned: true,
      banExpires: new Date(Date.now() - 60_000),
    });
    const future = await person({
      departmentId: scope.deptA1,
      banned: true,
      banExpires: new Date(Date.now() + 86_400_000),
    });
    const list = async (input: Parameters<typeof searchUsers>[2]) =>
      ids(await searchUsers(deps, admin, { limit: 50, ...input }));

    expect(await list({ role: 'ALUMNI' })).toEqual(expect.arrayContaining([alumni, pending]));
    expect(await list({ role: 'ALUMNI' })).not.toContain(student);
    expect(await list({ verificationStatus: 'PENDING' })).toEqual([pending]);
    const suspended = await list({ status: 'SUSPENDED' });
    expect(suspended.sort()).toEqual([banned, future].sort());
    const active = await list({ status: 'ACTIVE' });
    expect(active).toEqual(expect.arrayContaining([student, alumni, pending, expired]));
    expect(active).not.toContain(banned);
    expect(active).not.toContain(future);
    const item = (await searchUsers(deps, admin, { limit: 50 })).items.find(
      (candidate) => candidate.id === expired,
    )!;
    expect(item.status).toBe('ACTIVE');
  });

  it('sayfalama: imleçle tüm kullanıcılar tekrarsız ve eksiksiz gelir', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope.deptA1, { departmentId: scope.deptA1 });
    const created: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      created.push(await person({ departmentId: scope.deptA1 }));
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let round = 0; round < 10; round += 1) {
      const page = await searchUsers(deps, admin, { limit: 2, ...(cursor ? { cursor } : {}) });
      seen.push(...ids(page));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length);
    for (const id of created) expect(seen).toContain(id);
  });

  it('manageable: kendin hayır; yönetici hedefi bölüm yöneticisi için hayır; kısmen kapsanan hayır; sistem evet', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope.deptA1, { departmentId: scope.deptA1 });
    const system = await adminOf('SYSTEM', scope.deptA1);
    const plain = await person({ departmentId: scope.deptA1 });
    const partial = await person({ departmentId: scope.deptA1 });
    await addMembership(db, { userId: partial, departmentId: scope.deptB1, role: 'ACADEMIC' });
    const privileged = await adminOf('DEPARTMENT', scope.deptA1, { departmentId: scope.deptA1 });

    const asDept = new Map(
      (await searchUsers(deps, admin, { limit: 50 })).items.map((item) => [item.id, item]),
    );
    expect(asDept.get(plain)?.manageable).toBe(true);
    expect(asDept.get(admin)?.manageable).toBe(false);
    expect(asDept.get(partial)?.manageable).toBe(false);
    expect(asDept.get(privileged)).toMatchObject({ isAdmin: true, manageable: false });
    // Kapsam dışı üyelik yalnız bilgi olarak görünür.
    expect(
      asDept
        .get(partial)
        ?.memberships.map((m) => [m.departmentId, m.inScope])
        .sort(),
    ).toEqual(
      [
        [scope.deptA1, true],
        [scope.deptB1, false],
      ].sort(),
    );
    const asSystem = new Map(
      (await searchUsers(deps, system, { limit: 50, departmentId: scope.deptA1 })).items.map(
        (item) => [item.id, item],
      ),
    );
    expect(asSystem.get(partial)?.manageable).toBe(true);
    expect(asSystem.get(privileged)?.manageable).toBe(true);
    expect(asSystem.get(system)?.manageable).toBe(false);
  });

  it('kapsam dışı KAPANMIŞ üyelik geçmişi yöneticiye görünmez; mentor bilgisi yansır', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope.deptA1, { departmentId: scope.deptA1 });
    const userId = await person({ departmentId: scope.deptA1 });
    await addMembership(db, {
      userId,
      departmentId: scope.deptB1,
      role: 'STUDENT',
      entryYear: 2018,
      endedAt: new Date('2022-01-01'),
    });
    await addMentorProfile(db, userId);
    const item = (await searchUsers(deps, admin, { limit: 50 })).items.find(
      (candidate) => candidate.id === userId,
    )!;
    expect(item.memberships.map((membership) => membership.departmentId)).toEqual([scope.deptA1]);
    expect(item.mentorActive).toBe(true);
  });
});

describe('getUserDetail', () => {
  it('kapsamdaki kullanıcı: askı bilgisi; süresi dolmuş askı gösterilmez', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope.deptA1, { departmentId: scope.deptA1 });
    const suspended = await person({ departmentId: scope.deptA1, banned: true });
    await db.user.update({
      where: { id: suspended },
      data: { banReason: 'Kurallara aykırı davranış' },
    });
    const detail = await getUserDetail(deps, admin, { userId: suspended });
    expect(detail.suspension).toEqual({
      suspended: true,
      reason: 'Kurallara aykırı davranış',
      expiresAt: null,
    });
    const expired = await person({
      departmentId: scope.deptA1,
      banned: true,
      banExpires: new Date(Date.now() - 1000),
    });
    await db.user.update({ where: { id: expired }, data: { banReason: 'Eski askı' } });
    expect((await getUserDetail(deps, admin, { userId: expired })).suspension).toEqual({
      suspended: false,
      reason: null,
      expiresAt: null,
    });
  });

  it('kapsam dışı, üyeliksiz, silinmiş ya da olmayan kullanıcı: bölüm yöneticisinde ayırt edilemeyen AUTH_FORBIDDEN', async () => {
    const outside = await person({ departmentId: inst.deptB1 });
    const orphan = await person();
    const deleted = await person({ departmentId: inst.deptA1, deletedAt: new Date() });
    for (const userId of [outside, orphan, deleted, randomUUID()]) {
      await expectCode(getUserDetail(deps, admins.deptA1, { userId }), 'AUTH_FORBIDDEN');
    }
  });

  it('sistem yöneticisi: olmayan/silinmiş RESOURCE_NOT_FOUND; üyeliksiz kullanıcıyı görür', async () => {
    const orphan = await person();
    expect((await getUserDetail(deps, admins.system, { userId: orphan })).memberships).toEqual([]);
    const deleted = await person({ departmentId: inst.deptA1, deletedAt: new Date() });
    await expectCode(getUserDetail(deps, admins.system, { userId: deleted }), 'RESOURCE_NOT_FOUND');
    await expectCode(
      getUserDetail(deps, admins.system, { userId: randomUUID() }),
      'RESOURCE_NOT_FOUND',
    );
  });
});

// =============================================================================================
// Şikâyet kuyruğu
// =============================================================================================
describe('listAdminReports', () => {
  async function publishedExperience(institution: Institution, departmentId: string) {
    const moderator = await adminOf('DEPARTMENT', departmentId, { departmentId });
    const author = await person({ departmentId, role: 'STUDENT' });
    await grantRequiredConsents(db, author);
    const NOW = new Date();
    const row = await experiences.saveExperienceDraft(
      db,
      author,
      {
        departmentId,
        isAnonymous: true,
        content: {
          type: 'INTERNSHIP',
          organizationName: `Şirket ${tag()}`,
          termYear: 2026,
          termSeason: 'SUMMER',
          durationWeeks: 8,
          pay: 'PAID',
          applicationChannel: 'COMPANY_SITE',
          processSteps: [{ title: 'Başvuru', description: 'Form' }],
          interviewQuestions: ['Soru?'],
          whatLearned: 'Çok şey',
          advice: 'Başvur',
        },
      },
      NOW,
    );
    await experiences.submitExperience(db, author, { experienceId: row.id }, NOW);
    await experiences.reviewExperience(
      db,
      moderator,
      { experienceId: row.id, decision: 'PUBLISH' },
      NOW,
    );
    void institution;
    return { experienceId: row.id, author, moderator };
  }
  const report = async (
    experienceId: string,
    reporterId: string | null,
    reason = 'Yanıltıcı bilgi',
  ) => (await db.report.create({ data: { targetId: experienceId, reporterId, reason } })).id;

  it('kuyruk yalnız kapsamdaki bölümlerin şikâyetlerini gösterir; anonim yazar ve raportör kimliği çıktıda yok', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope.deptA1, { departmentId: scope.deptA1 });
    const mine = await publishedExperience(scope, scope.deptA1);
    const outside = await publishedExperience(scope, scope.deptB1);
    const reporter = await person({ departmentId: scope.deptA1 });
    const r1 = await report(mine.experienceId, reporter);
    const r2 = await report(mine.experienceId, null, 'İkinci şikâyet');
    const r3 = await report(outside.experienceId, reporter);

    const page = await listAdminReports(deps, admin, { limit: 50 });
    expect(ids(page).sort()).toEqual([r1, r2].sort());
    expect(ids(page)).not.toContain(r3);
    expect(page.items[0]!.target).toMatchObject({
      type: 'EXPERIENCE',
      id: mine.experienceId,
      isAnonymous: true,
      departmentId: scope.deptA1,
      openReportCount: 2,
    });
    const text = JSON.stringify(page);
    for (const secret of [reporter, mine.author, mine.moderator])
      expect(text).not.toContain(secret);

    // Süzgeç yetki vermez.
    expect((await listAdminReports(deps, admin, { departmentId: scope.deptB1 })).items).toEqual([]);
    // Sistem yöneticisi kapsam dışı bölümü de görür.
    const system = await adminOf('SYSTEM', scope.deptA1);
    expect(ids(await listAdminReports(deps, system, { departmentId: scope.deptB1 }))).toEqual([r3]);
  });

  it('durum süzgeci ve çözüm bilgisi; çözülen şikâyet açık sayıdan düşer', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope.deptA1, { departmentId: scope.deptA1 });
    const exp = await publishedExperience(scope, scope.deptA1);
    const open = await report(exp.experienceId, null, 'Açık');
    const done = await report(exp.experienceId, null, 'Çözülmüş');
    await db.report.update({
      where: { id: done },
      data: {
        status: 'RESOLVED',
        reviewedById: exp.moderator,
        reviewedAt: new Date(),
        resolutionNote: 'Düzeltildi',
      },
    });
    const openPage = await listAdminReports(deps, admin, {});
    expect(ids(openPage)).toEqual([open]);
    expect(openPage.items[0]!.target.openReportCount).toBe(1);
    const resolved = await listAdminReports(deps, admin, { status: 'RESOLVED' });
    expect(resolved.items[0]).toMatchObject({
      id: done,
      status: 'RESOLVED',
      resolutionNote: 'Düzeltildi',
    });
    expect(JSON.stringify(resolved)).not.toContain(exp.moderator);
  });

  it('sayfalama imleçle çalışır', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope.deptA1, { departmentId: scope.deptA1 });
    const exp = await publishedExperience(scope, scope.deptA1);
    const created = [];
    for (let index = 0; index < 3; index += 1)
      created.push(await report(exp.experienceId, null, `Şikâyet ${index}`));
    const first = await listAdminReports(deps, admin, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await listAdminReports(deps, admin, { limit: 2, cursor: first.nextCursor! });
    expect([...ids(first), ...ids(second)].sort()).toEqual(created.sort());
    expect(second.nextCursor).toBeNull();
  });

  it('genel bakışta açık şikâyet ve bekleyen deneyim sayıları kapsamla sınırlıdır', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope.deptA1, { departmentId: scope.deptA1 });
    const before = await getAdminOverview(deps, admin);
    const mine = await publishedExperience(scope, scope.deptA1);
    const outside = await publishedExperience(scope, scope.deptB1);
    await report(mine.experienceId, null);
    await report(outside.experienceId, null);
    const after = await getAdminOverview(deps, admin);
    expect(after.counts.openReports - before.counts.openReports).toBe(1);
  });
});

// =============================================================================================
// Yönetici atamaları
// =============================================================================================
describe('listAdminGrants', () => {
  it('etkin ve kaldırılmış atamalar ayrı listelenir; e-posta maskeli', async () => {
    const scope = await createInstitution(db);
    const holder = await adminOf('DEPARTMENT', scope.deptA1, { departmentId: scope.deptA1 });
    const revoked = await createUser(db);
    await addMembership(db, { userId: revoked, departmentId: scope.deptA1, role: 'ACADEMIC' });
    const revokedGrant = await addGrant(db, {
      userId: revoked,
      scope: 'DEPARTMENT',
      departmentId: scope.deptA1,
      revoked: true,
    });
    const active = await listAdminGrants(deps, admins.system, { limit: 50 });
    const grantOfHolder = active.items.find((item) => item.userId === holder)!;
    expect(grantOfHolder).toMatchObject({
      scope: 'DEPARTMENT',
      departmentId: scope.deptA1,
      departmentName: 'Bölüm A1',
      revokedAt: null,
    });
    expect(grantOfHolder.maskedEmail).toMatch(/\*{3}@/);
    expect(ids(active)).not.toContain(revokedGrant);
    const inactive = await listAdminGrants(deps, admins.system, { active: false, limit: 50 });
    expect(ids(inactive)).toContain(revokedGrant);
    const holderEmail = (await db.user.findUniqueOrThrow({ where: { id: holder } })).email;
    expect(JSON.stringify(active)).not.toContain(holderEmail);
  });
});

// =============================================================================================
// İşlem kaydı görüntüleme
// =============================================================================================
describe('listAuditLog', () => {
  it('filtreler eylem, hedef, aktör ve tarihe göre süzer; en yeni önce; aktör adı okuma anında gelir', async () => {
    const actor = await adminOf('SYSTEM', inst.deptA1);
    const targetId = randomUUID();
    const t0 = Date.now();
    await db.$transaction(async (tx) => {
      await recordAdminAction(tx, {
        actor: { userId: actor },
        action: 'USER_SUSPEND',
        targetType: 'USER',
        targetId,
        reason: 'Kurallara aykırı davranış',
        metadata: { sessionsRevoked: 2 },
      });
      await recordAdminAction(tx, {
        actor: { userId: actor },
        action: 'ADMIN_GRANT',
        targetType: 'ADMIN_GRANT',
        targetId,
      });
    });
    const byTarget = await listAuditLog(deps, admins.system, { targetId });
    expect(byTarget.items.map((item) => item.action).sort()).toEqual([
      'ADMIN_GRANT',
      'USER_SUSPEND',
    ]);
    expect(byTarget.items[0]!.id > byTarget.items[1]!.id).toBe(true);
    const suspend = byTarget.items.find((item) => item.action === 'USER_SUSPEND')!;
    expect(suspend).toMatchObject({
      actorId: actor,
      targetType: 'USER',
      reason: 'Kurallara aykırı davranış',
      metadata: { sessionsRevoked: 2 },
    });
    expect(suspend.actorName).toBe('Test Kullanıcı');

    expect(
      (await listAuditLog(deps, admins.system, { targetId, action: 'USER_SUSPEND' })).items,
    ).toHaveLength(1);
    expect(
      (await listAuditLog(deps, admins.system, { targetId, targetType: 'REPORT' })).items,
    ).toEqual([]);
    expect(
      (await listAuditLog(deps, admins.system, { targetId, actorId: randomUUID() })).items,
    ).toEqual([]);
    expect(
      (
        await listAuditLog(deps, admins.system, {
          targetId,
          from: new Date(t0 - 60_000),
          to: new Date(t0 + 60_000),
        })
      ).items,
    ).toHaveLength(2);
    expect(
      (await listAuditLog(deps, admins.system, { targetId, to: new Date(t0 - 60_000) })).items,
    ).toEqual([]);
  });

  it('silinmiş aktörün adı yer tutucudur', async () => {
    const actor = await adminOf('SYSTEM', inst.deptA1);
    const targetId = randomUUID();
    await db.$transaction((tx) =>
      recordAdminAction(tx, {
        actor: { userId: actor },
        action: 'ADMIN_GRANT',
        targetType: 'ADMIN_GRANT',
        targetId,
      }),
    );
    await db.user.update({
      where: { id: actor },
      data: { deletedAt: new Date(), name: 'Silinmiş Eski Ad' },
    });
    const entry = (await listAuditLog(deps, admins.system, { targetId })).items[0]!;
    expect(entry.actorName).toBe('Silinmiş hesap');
    expect(JSON.stringify(entry)).not.toContain('Eski Ad');
  });

  it('eski/elle eklenmiş satırda kişisel veri görünse bile panel ham değeri göstermez', async () => {
    const actor = await adminOf('SYSTEM', inst.deptA1);
    const targetId = randomUUID();
    // Yazım yolu bunu reddeder; son ağ için veritabanına doğrudan eklenir.
    await db.adminAuditLog.create({
      data: {
        actorId: actor,
        action: 'USER_SUSPEND',
        targetType: 'USER',
        targetId,
        reason: 'Şikâyet eden ayse@ornek.com ile görüştü',
        metadata: { note: 'tel 0532 123 45 67', ok: 'sade', list: ['a@b.co', 'iyi'], count: 3 },
      },
    });
    const entry = (await listAuditLog(deps, admins.system, { targetId })).items[0]!;
    const text = JSON.stringify(entry);
    expect(text).not.toContain('ayse@');
    expect(text).not.toContain('0532');
    expect(text).not.toContain('a@b.co');
    expect(entry.metadata).toEqual({
      note: '[gizlendi]',
      ok: 'sade',
      list: ['[gizlendi]', 'iyi'],
      count: 3,
    });
    expect(entry.reason).toBe('[gizlendi]');
  });

  it('sayfalama imleçle çalışır; tarih aralığı ters ise doğrulama hatası', async () => {
    const actor = await adminOf('SYSTEM', inst.deptA1);
    const targetId = randomUUID();
    await db.$transaction(async (tx) => {
      for (let index = 0; index < 3; index += 1) {
        await recordAdminAction(tx, {
          actor: { userId: actor },
          action: 'ADMIN_GRANT',
          targetType: 'ADMIN_GRANT',
          targetId,
        });
      }
    });
    const first = await listAuditLog(deps, admins.system, { targetId, limit: 2 });
    const second = await listAuditLog(deps, admins.system, {
      targetId,
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    await expect(
      listAuditLog(deps, admins.system, { from: new Date(2030, 1, 1), to: new Date(2020, 1, 1) }),
    ).rejects.toThrow();
  });
});

it('yeni kuyruk sayaçları yetkili kapsam ve karar verilebilir durumlarla sınırlıdır', async () => {
  const scoped = await createInstitution(db);
  const manager = await adminOf('DEPARTMENT', scoped.deptA1, { departmentId: scoped.deptA1 });
  const at = new Date('2033-01-01T10:00:00Z');
  const authors: string[] = [];
  for (const departmentId of [scoped.deptA1, scoped.deptB1]) {
    const alumni = await person({ departmentId, role: 'ALUMNI' }),
      student = await person({ departmentId });
    authors.push(alumni);
    await db.faqRequest.create({
      data: {
        askerId: student,
        departmentIdAtWrite: departmentId,
        question: 'Başvuru belgeleri nasıl hazırlanır?',
      },
    });
    await db.jobPosting.create({
      data: {
        authorId: alumni,
        departmentIdAtWrite: departmentId,
        title: 'İncelenecek ilan',
        submittedAt: new Date(),
        organizationName: 'Örnek ekip',
        deadlineOn: new Date(Date.now() + 30 * 86400000),
        description: 'Yerel sayaç sınaması için örnek açıklama.',
        isRemote: true,
        applyMethod: 'URL',
        applyUrl: 'https://example.test/basvuru',
        status: 'PENDING',
      },
    });
    for (const status of ['STUDENT_CONFIRMED', 'ACCEPTED_ALUMNI_CONFIRMED', 'PROPOSED'] as const) {
      const target = await person({ departmentId });
      await db.referralClaim.create({
        data: {
          alumnusId: alumni,
          studentId: target,
          departmentIdAtWrite: departmentId,
          status,
          studentConfirmedAt: new Date(),
          approvedAt: new Date(),
          acceptanceProposedAt: new Date(),
          alumniConfirmedAt: new Date(),
        },
      });
    }
    await db.alumniStory.create({
      data: {
        userId: alumni,
        departmentId,
        body: 'Yerel sayaç sınaması için hazırlanmış yeterince uzun örnek mezun hikâyesi.',
        status: 'PENDING',
      },
    });
    await db.campusEvent.create({
      data: {
        title: 'Bekleyen buluşma',
        description: 'Yerel sayaç sınaması',
        location: 'Kampüs',
        startsAt: at,
        endsAt: new Date(+at + 3600000),
        capacity: 10,
        status: 'PENDING',
        createdById: alumni,
        departments: { create: { departmentId } },
      },
    });
  }
  for (const hidden of [{ banned: true }, { deletedAt: new Date() }]) {
    const author = await person({ departmentId: scoped.deptA1, role: 'ALUMNI', ...hidden });
    await db.alumniStory.create({
      data: {
        userId: author,
        departmentId: scoped.deptA1,
        body: 'Görünmemesi gereken mezunun sayaç kapsamı için örnek hikâyesi.',
        status: 'PENDING',
      },
    });
  }
  // Tek bölüm yöneticisi başka bölüme de hedeflenen etkinliği yönetemez.
  await db.campusEvent.create({
    data: {
      title: 'Ortak buluşma',
      description: 'İki ayrı kapsam hedefi',
      location: 'Kampüs',
      startsAt: at,
      endsAt: new Date(+at + 3600000),
      capacity: 10,
      status: 'PENDING',
      createdById: authors[0]!,
      departments: { create: [{ departmentId: scoped.deptA1 }, { departmentId: scoped.deptB1 }] },
    },
  });
  // Yalnız başka bölümde aktif mezun üyeliği olan kişinin eski hikâyesi görünmez.
  await db.alumniStory.create({
    data: {
      userId: authors[1]!,
      departmentId: scoped.deptA1,
      body: 'Yerel kapsam dışı mezun hikâyesi için yeterli uzunlukta örnek açıklama.',
      status: 'PENDING',
    },
  });
  const out = await getAdminOverview(deps, manager);
  expect(out.counts).toMatchObject({
    pendingFaqRequests: 1,
    pendingJobPostings: 1,
    pendingReferrals: 2,
    pendingCampusEvents: 1,
    pendingAlumniStories: 1,
  });
});

it('geniş fakülte kapsamında hikâye sayacı bölüm başına sorgu veya JOIN çoğaltmadan tamamlanır', async () => {
  const scoped = await createInstitution(db);
  const manager = await adminOf('FACULTY', scoped.deptA1, { facultyId: scoped.facultyA });
  const added = Array.from({ length: 128 }, (_, i) => ({
    id: randomUUID(),
    facultyId: scoped.facultyA,
    name: `Sayaç bölümü ${i}`,
    code: `Q${i}`,
  }));
  await db.department.createMany({ data: added });
  const alumni = await person({ departmentId: scoped.deptA1, role: 'ALUMNI' });
  await db.alumniStory.create({
    data: {
      userId: alumni,
      departmentId: scoped.deptA1,
      body: 'Geniş kapsamlı yönetim sayacı için yeterli uzunlukta örnek hikâye.',
      status: 'PENDING',
    },
  });
  const result = await getAdminOverview(deps, manager);
  expect(result.departments).toHaveLength(130);
  expect(result.counts.pendingAlumniStories).toBe(1);
});
