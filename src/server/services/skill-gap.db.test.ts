import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  addMentorProfile,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { normalizeName } from '../rules/dictionary';
import { searchMentorsSchema } from '@/contracts/mentor-directory';
import { loadActor } from '../permissions/actor';
import { searchMentors } from './mentor-directory';
import { buildDataExport } from './dataExport';
import { deleteAccount } from './accountDeletion';
import { getProfile } from './profile-content';
import { getSkillGap, selectSkillGoal } from './skill-gap';
import { attachSkill, ensureProfile } from './profile-skills';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
async function fixture() {
  const inst = await createInstitution(db);
  const other = await createInstitution(db);
  const student = await createUser(db);
  await addMembership(db, {
    userId: student,
    departmentId: inst.deptA1,
    role: 'STUDENT',
    entryYear: 2023,
  });
  await grantRequiredConsents(db, student);
  const key = randomUUID().slice(0, 8);
  const title = await db.title.create({
    data: { name: `Analist ${key}`, normalizedName: `analist ${key}`, aliases: [`analyst ${key}`] },
    select: { id: true, name: true },
  });
  const sql = await db.skill.create({
    data: {
      name: `SQL ${key}`,
      normalizedName: `sql ${key}`,
      aliases: [`structured query ${key}`],
    },
    select: { id: true, name: true },
  });
  const excel = await db.skill.create({
    data: { name: `Excel ${key}`, normalizedName: `excel ${key}`, aliases: [] },
    select: { id: true, name: true },
  });
  const rare = await db.skill.create({
    data: { name: `Nadir ${key}`, normalizedName: `nadir ${key}`, aliases: [] },
    select: { id: true, name: true },
  });
  return { inst, other, student, title, sql, excel, rare, key };
}
async function addTag(userId: string, label: string) {
  const profile = await db.profile.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });
  const slug = normalizeName(label, 'SKILL');
  const tag = await db.tag.upsert({
    where: { kind_slug: { kind: 'SKILL', slug } },
    create: { kind: 'SKILL', slug, label, curated: true },
    update: {},
    select: { id: true },
  });
  await db.profileTag.createMany({
    data: [{ profileId: profile.id, tagId: tag.id }],
    skipDuplicates: true,
  });
}
async function alumni(
  w: Awaited<ReturnType<typeof fixture>>,
  options: { departmentId?: string; banned?: boolean; current?: boolean } = {},
) {
  const userId = await createUser(db, { banned: options.banned });
  await addMembership(db, {
    userId,
    departmentId: options.departmentId ?? w.inst.deptA1,
    role: 'ALUMNI',
    graduationYear: 2020,
  });
  await db.position.create({
    data: {
      userId,
      companyRaw: 'Kurum',
      titleId: w.title.id,
      titleRaw: w.title.name,
      isCurrent: options.current ?? true,
      source: 'MANUAL',
    },
  });
  return userId;
}
it('kapsam, k ve tamamlayıcı bastırma; eş anlamlı öğrenci ve mezun becerileri tekleştirilir', async () => {
  const w = await fixture();
  expect(await getSkillGap(db, w.student)).toEqual({ title: null, analysis: null });
  await selectSkillGoal(db, w.student, { titleId: w.title.id });
  expect((await buildDataExport(db, w.student)).profile?.targetTitleId).toBe(w.title.id);
  const viewer = await createUser(db);
  await addMembership(db, {
    userId: viewer,
    departmentId: w.inst.deptA1,
    role: 'STUDENT',
    entryYear: 2023,
  });
  const publicProfile = await getProfile({ db }, viewer, w.student);
  expect(JSON.stringify(publicProfile)).not.toContain(w.title.id);
  expect(JSON.stringify(publicProfile)).not.toContain('targetTitleId');
  await addTag(w.student, `structured query ${w.key}`);
  const people = [];
  for (let i = 0; i < 10; i++) {
    const id = await alumni(w);
    people.push(id);
    if (i === 0)
      await db.$transaction(async (tx) => {
        const profile = await ensureProfile(tx, id);
        await attachSkill(tx, profile.id, {
          name: `structured query ${w.key}`,
          canonicalName: w.sql.name,
        });
      });
    else if (i < 5) await addTag(id, w.sql.name);
    if (i >= 5) await addTag(id, w.excel.name);
    if (i === 0) await addTag(id, w.rare.name);
    if (i >= 5 && i < 9)
      await db.userSkill.create({
        data: {
          userId: id,
          skillId: w.rare.id,
          name: w.rare.name,
          normalizedName: normalizeName(w.rare.name, 'SKILL'),
          source: 'CV',
        },
      });
  }
  // Aynı kişinin ikinci pozisyonu grubu büyütmez; başka üniversite ve askıdaki mezun dışarıda.
  await db.position.create({
    data: {
      userId: people[0]!,
      companyRaw: 'İkinci kurum',
      titleId: w.title.id,
      titleRaw: w.title.name,
      isCurrent: true,
      source: 'MANUAL',
    },
  });
  const foreign = await alumni(w, { departmentId: w.other.deptA1 });
  await addTag(foreign, w.rare.name);
  const suspended = await alumni(w, { banned: true });
  await addTag(suspended, w.rare.name);
  const result = await getSkillGap(db, w.student);
  expect(result).toEqual({
    title: w.title,
    analysis: {
      band: '10+',
      progress: 50,
      missing: [{ id: w.excel.id, label: w.excel.name, percent: 50 }],
    },
  });
  const json = JSON.stringify(result);
  for (const person of [...people, foreign, suspended]) expect(json).not.toContain(person);
  expect(json).not.toContain(w.rare.name);
  await db.user.update({ where: { id: people[0]! }, data: { banned: true } });
  expect((await getSkillGap(db, w.student)).analysis).toBeNull();
  await db.user.update({ where: { id: people[0]! }, data: { banned: false } });
  await db.membership.updateMany({
    where: { userId: people[0]!, endedAt: null },
    data: { endedAt: new Date() },
  });
  expect((await getSkillGap(db, w.student)).analysis).toBeNull();
  const user = await db.user.findUniqueOrThrow({
    where: { id: w.student },
    select: { email: true },
  });
  await deleteAccount(
    db,
    w.student,
    { publishedContent: 'ANONYMIZE', confirmEmail: user.email },
    { removeStoredFiles: null },
  );
  expect(await db.profile.findUnique({ where: { userId: w.student } })).toBeNull();
});
it('yalnız öğrenci hedef seçer ve beceriyle mentor bağlantısı aynı üniversiteyi korur', async () => {
  const w = await fixture();
  const mentor = await alumni(w);
  await addMentorProfile(db, mentor);
  await addTag(mentor, `structured query ${w.key}`);
  const foreign = await alumni(w, { departmentId: w.other.deptA1 });
  await addMentorProfile(db, foreign);
  await addTag(foreign, w.sql.name);
  const legacyOnly = await alumni(w);
  await addMentorProfile(db, legacyOnly);
  await db.userSkill.create({
    data: {
      userId: legacyOnly,
      skillId: w.sql.id,
      name: w.sql.name,
      normalizedName: normalizeName(w.sql.name, 'SKILL'),
      source: 'CV',
    },
  });
  await grantRequiredConsents(db, mentor);
  await expect(selectSkillGoal(db, mentor, { titleId: w.title.id })).rejects.toMatchObject({
    code: 'AUTH_FORBIDDEN',
  });
  await expect(selectSkillGoal(db, w.student, { titleId: 'missing' })).rejects.toMatchObject({
    code: 'RESOURCE_NOT_FOUND',
  });
  const actor = await loadActor(db, w.student, new Date());
  const result = await searchMentors(
    { db },
    actor!,
    searchMentorsSchema.parse({ skill: `structured query ${w.key}` }),
  );
  expect(result.items.map((item) => item.userId)).toContain(mentor);
  expect(result.items.map((item) => item.userId)).not.toContain(foreign);
  expect(result.items.map((item) => item.userId)).not.toContain(legacyOnly);
  const invalid = await searchMentors({ db }, actor!, searchMentorsSchema.parse({ skill: '%%' }));
  expect(invalid.items).toEqual([]);
});

it('iki güncel unvanlı mezun yalnız en son başlayanda, eşitlikte eski kimlikte sayılır', async () => {
  const w = await fixture();
  const titleB = await db.title.create({
    data: { name: `Uzman ${w.key}`, normalizedName: `uzman ${w.key}`, aliases: [] },
    select: { id: true, name: true },
  });
  const shared = await alumni(w);
  await addTag(shared, w.sql.name);
  await db.position.create({
    data: {
      id: `${shared}-1`,
      userId: shared,
      companyRaw: 'Kurum B',
      titleId: titleB.id,
      titleRaw: titleB.name,
      isCurrent: true,
      startYear: 2024,
      startMonth: 3,
      source: 'MANUAL',
    },
  });
  for (let i = 0; i < 9; i++) {
    const id = await alumni(w);
    await addTag(id, i < 4 ? w.sql.name : w.excel.name);
    await db.position.create({
      data: {
        userId: id,
        companyRaw: 'Kurum B',
        titleId: titleB.id,
        titleRaw: titleB.name,
        isCurrent: true,
        startYear: 2024,
        startMonth: 3,
        source: 'MANUAL',
      },
    });
  }
  await selectSkillGoal(db, w.student, { titleId: w.title.id });
  expect((await getSkillGap(db, w.student)).analysis).toBeNull();
  await selectSkillGoal(db, w.student, { titleId: titleB.id });
  expect((await getSkillGap(db, w.student)).analysis?.band).toBe('10+');
  // Aynı tarihli ve sonradan açılmış A kaydı, eski B kimliğinin önüne geçmez.
  await db.position.create({
    data: {
      id: `${shared}-2`,
      userId: shared,
      companyRaw: 'Kurum A',
      titleId: w.title.id,
      titleRaw: w.title.name,
      isCurrent: true,
      startYear: 2024,
      startMonth: 3,
      source: 'MANUAL',
    },
  });
  expect((await getSkillGap(db, w.student)).analysis?.band).toBe('10+');
  // Daha sonraki başlangıç A'yı seçer; B artık dokuz kişidir.
  await db.position.create({
    data: {
      userId: shared,
      companyRaw: 'Yeni kurum',
      titleId: w.title.id,
      titleRaw: w.title.name,
      isCurrent: true,
      startYear: 2025,
      startMonth: 1,
      source: 'MANUAL',
    },
  });
  expect((await getSkillGap(db, w.student)).analysis).toBeNull();
});
