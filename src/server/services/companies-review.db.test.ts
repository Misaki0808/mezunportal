import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  addMentorProfile,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { companySlug, getCompany, mergeCompanies, searchCompanies } from './companies';
import { isCodedError } from '@/lib/errors';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const NOW = new Date('2098-05-10T12:00:00Z');
async function setup() {
  const inst = await createInstitution(db),
    viewer = await createUser(db);
  await addMembership(db, {
    userId: viewer,
    departmentId: inst.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await grantRequiredConsents(db, viewer);
  const marker = randomUUID();
  const company = await db.company.create({
    data: {
      name: 'İŞIK İnceleme ' + marker,
      normalizedName: 'inceleme ' + marker,
      aliases: ['Çığ ÖRNEK ' + marker],
    },
  });
  return { inst, viewer, company, slug: companySlug(company.name, company.id), marker };
}
async function person(departmentId: string) {
  const name = 'Kişi' + randomUUID(),
    userId = await createUser(db, { name });
  await addMembership(db, { userId, departmentId, role: 'ALUMNI', graduationYear: 2020 });
  return { userId, name };
}
async function position(userId: string, companyId: string) {
  return db.position.create({
    data: {
      userId,
      companyId,
      companyRaw: 'Kurum',
      titleRaw: 'Analist',
      source: 'MANUAL',
      isCurrent: true,
    },
  });
}
async function experience(
  companyId: string,
  departmentId: string,
  authorId: string,
  anonymous = false,
) {
  return db.experience.create({
    data: {
      companyId,
      departmentIdAtWrite: departmentId,
      authorId,
      isAnonymous: anonymous,
      type: 'INTERNSHIP',
      organizationName: 'Kurum',
      durationWeeks: 8,
      pay: 'PAID',
      applicationChannel: 'REFERRAL',
      status: 'PUBLISHED',
      publishedAt: NOW,
      moderatedAt: NOW,
      moderatedById: authorId,
      termYear: 2025,
      termSeason: 'SUMMER',
      whatLearned: 'Sahte kanıt metni',
      advice: 'Genel öneri',
    },
  });
}
async function code(p: Promise<unknown>) {
  try {
    await p;
    return null;
  } catch (e) {
    if (!isCodedError(e)) throw e;
    return e.code;
  }
}

it('k=2→3 ve anonim yayın öncesi/sonrası: kesitler birlikte gizlenir, alternatif yazar dünyaları birebir aynıdır', async () => {
  const w = await setup(),
    deps = { db, now: () => NOW };
  const users = await Promise.all([0, 1, 2].map(() => person(w.inst.deptA1)));
  await position(users[0]!.userId, w.company.id);
  await position(users[1]!.userId, w.company.id);
  await addMentorProfile(db, users[0]!.userId);
  await experience(w.company.id, w.inst.deptA1, users[1]!.userId);
  await experience(w.company.id, w.inst.deptA1, users[2]!.userId);
  const before = await getCompany(deps, w.viewer, w.slug);
  expect(before.alumni.current).toBeNull();
  expect(before.periods).toEqual([]);
  expect(before.mentors.map((m) => m.userId)).toContain(users[0]!.userId);
  const popularBefore = (await searchCompanies(deps, w.viewer, w.marker)).popular;
  const anonymous = await experience(w.company.id, w.inst.deptA1, users[0]!.userId, true);
  const first = await getCompany(deps, w.viewer, w.slug);
  expect(first.alumni).toEqual({ current: null, former: null });
  expect(first.periods).toEqual([]);
  expect(first.mentors).toEqual([]);
  expect(first.experiences.find((e) => e.id === anonymous.id)).not.toHaveProperty('author');
  expect((await searchCompanies(deps, w.viewer, w.marker)).popular).toEqual(popularBefore);
  // 3. görünür pozisyon eşiği geçtiğinde anonim yazar için yeni bir fark çıkmamalı.
  await position(users[2]!.userId, w.company.id);
  expect(await getCompany(deps, w.viewer, w.slug)).toEqual(first);
  for (const author of users.slice(1)) {
    await db.experience.update({ where: { id: anonymous.id }, data: { authorId: author.userId } });
    expect(await getCompany(deps, w.viewer, w.slug)).toEqual(first);
    expect((await searchCompanies(deps, w.viewer, w.marker)).popular).toEqual(popularBefore);
  }
  // Anonim kayıt olmadığı dünyada k=3 sayımı meşru biçimde açılır.
  await db.experience.delete({ where: { id: anonymous.id } });
  expect((await getCompany(deps, w.viewer, w.slug)).alumni.current).toBe(3);
});

it('aynı yazardan çok kayıt k eşiğini açmaz; üç farklı açık yazar açar, anonim yeni yayın sıralamayı değiştirmez', async () => {
  const w = await setup(),
    deps = { db, now: () => NOW };
  const users = await Promise.all([0, 1, 2].map(() => person(w.inst.deptA1)));
  for (let i = 0; i < 4; i++) await experience(w.company.id, w.inst.deptA1, users[i % 2]!.userId);
  expect((await getCompany(deps, w.viewer, w.slug)).periods).toEqual([]);
  expect((await searchCompanies(deps, w.viewer, '')).popular.map((c) => c.id)).not.toContain(
    w.company.id,
  );
  await experience(w.company.id, w.inst.deptA1, users[2]!.userId);
  expect((await getCompany(deps, w.viewer, w.slug)).periods).toEqual([
    { season: 'SUMMER', count: 5 },
  ]);
  const popular = (await searchCompanies(deps, w.viewer, '')).popular;
  expect(popular.map((c) => c.id)).toContain(w.company.id);
  await experience(w.company.id, w.inst.deptA1, users[0]!.userId, true);
  expect((await searchCompanies(deps, w.viewer, '')).popular).toEqual(popular);
  expect((await getCompany(deps, w.viewer, w.slug)).periods).toEqual([]);
});

it('K-07, askı/silme ve tam süre sınırı; katlama ve SQL/LIKE girdileri kimlik ve tablo sızdırmaz', async () => {
  const w = await setup(),
    foreign = await createInstitution(db),
    deps = { db, now: () => NOW };
  const users = await Promise.all([0, 1, 2].map(() => person(w.inst.deptA1)));
  for (const u of users) {
    await position(u.userId, w.company.id);
    await experience(w.company.id, w.inst.deptA1, u.userId);
  }
  await addMentorProfile(db, users[0]!.userId);
  const outside = await person(foreign.deptA1);
  await position(outside.userId, w.company.id);
  const outsideExp = await experience(w.company.id, foreign.deptA1, outside.userId, true);
  expect((await getCompany(deps, w.viewer, w.slug)).experiences.map((e) => e.id)).not.toContain(
    outsideExp.id,
  );
  await db.user.update({
    where: { id: users[0]!.userId },
    data: { banned: true, banExpires: new Date(+NOW + 1) },
  });
  let page = await getCompany(deps, w.viewer, w.slug);
  expect(page.alumni.current).toBeNull();
  expect(page.mentors).toEqual([]);
  expect(JSON.stringify(page)).not.toContain(users[0]!.userId);
  expect(JSON.stringify(page)).not.toContain(users[0]!.name);
  await db.user.update({ where: { id: users[0]!.userId }, data: { banExpires: NOW } });
  page = await getCompany(deps, w.viewer, w.slug);
  expect(page.alumni.current).toBe(3);
  expect(page.mentors.map((m) => m.userId)).toContain(users[0]!.userId);
  await db.user.update({ where: { id: users[0]!.userId }, data: { deletedAt: NOW } });
  page = await getCompany(deps, w.viewer, w.slug);
  expect(page.alumni.current).toBeNull();
  expect(page.mentors).toEqual([]);
  expect(JSON.stringify(page)).not.toContain(users[0]!.userId);
  expect(JSON.stringify(page)).not.toContain(users[0]!.name);
  for (const q of [
    'ışık inceleme ' + w.marker,
    'ISIK Inceleme ' + w.marker,
    'cig ornek ' + w.marker,
  ])
    expect((await searchCompanies(deps, w.viewer, q)).companies.map((c) => c.id)).toContain(
      w.company.id,
    );
  for (const q of ['\'); DROP TABLE \\"Company\\"; --', '%_\\\\'])
    expect((await searchCompanies(deps, w.viewer, q)).companies).toEqual([]);
  expect(await db.company.count({ where: { id: w.company.id } })).toBe(1);
});

it('birleştirme yalnız sistemde; eşleşmeyen bağlantı ve zincir yönlendirmesi taşınır, tekrar tek audit bırakır', async () => {
  const w = await setup();
  const admin = await createUser(db);
  await addMembership(db, { userId: admin, departmentId: w.inst.deptA1, role: 'ACADEMIC' });
  await grantRequiredConsents(db, admin);
  await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: w.inst.deptA1 });
  const target = await db.company.create({
    data: { name: 'Hedef ' + w.marker, normalizedName: 'hedef ' + w.marker, aliases: [] },
  });
  expect(await code(mergeCompanies({ db }, admin, w.company.id, target.id))).toBe('AUTH_FORBIDDEN');
  await addGrant(db, { userId: admin, scope: 'SYSTEM' });
  const raw = await db.unmatchedValue.create({
    data: {
      kind: 'COMPANY',
      rawValue: 'Eşleşme ' + w.marker,
      normalizedValue: 'eslesme ' + w.marker,
      resolvedToId: w.company.id,
    },
  });
  await mergeCompanies({ db }, admin, w.company.id, target.id);
  expect((await db.unmatchedValue.findUniqueOrThrow({ where: { id: raw.id } })).resolvedToId).toBe(
    target.id,
  );
  const final = await db.company.create({
    data: { name: 'Son ' + w.marker, normalizedName: 'son ' + w.marker, aliases: [] },
  });
  await mergeCompanies({ db }, admin, target.id, final.id);
  expect((await getCompany({ db }, w.viewer, w.slug)).id).toBe(final.id);
  expect(await mergeCompanies({ db }, admin, w.company.id, target.id)).toEqual({
    targetId: final.id,
    alreadyMerged: true,
  });
  expect(
    await db.adminAuditLog.count({
      where: { action: 'DICTIONARY_CHANGE', targetId: { in: [target.id, final.id] } },
    }),
  ).toBe(2);
});
