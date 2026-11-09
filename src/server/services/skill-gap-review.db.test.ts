import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { getSkillGap, selectSkillGoal } from './skill-gap';
import { attachSkill, ensureProfile } from './profile-skills';
import { normalizeName } from '../rules/dictionary';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
async function fixture(n = 12) {
  const inst = await createInstitution(db),
    student = await createUser(db),
    key = randomUUID();
  await addMembership(db, {
    userId: student,
    departmentId: inst.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await grantRequiredConsents(db, student);
  const title = await db.title.create({
    data: { name: 'Hedef ' + key, normalizedName: key, aliases: [] },
  });
  const skills = await Promise.all(
    ['SQL', 'Excel', 'Gizli'].map((name) =>
      db.skill.create({
        data: {
          name: name + ' ' + key,
          normalizedName: normalizeName(name + ' ' + key),
          aliases: ['alias ' + name + ' ' + key],
        },
      }),
    ),
  );
  const people: string[] = [];
  async function tag(userId: string, index: number, alias = false) {
    await db.$transaction(async (tx) => {
      const p = await ensureProfile(tx, userId);
      await attachSkill(tx, p.id, {
        name: alias ? skills[index]!.aliases[0]! : skills[index]!.name,
        canonicalName: alias ? null : skills[index]!.name,
      });
    });
  }
  async function member(userId: string) {
    await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role: 'ALUMNI',
      graduationYear: 2020,
    });
    return db.position.create({
      data: {
        userId,
        companyRaw: 'Kurum',
        titleId: title.id,
        titleRaw: title.name,
        isCurrent: true,
        source: 'MANUAL',
        startYear: 2024,
        startMonth: 1,
      },
    });
  }
  for (let i = 0; i < n; i++) {
    const id = await createUser(db);
    people.push(id);
    await member(id);
    if (i < Math.ceil(n / 2)) await tag(id, 0);
    if (i >= Math.ceil(n / 2)) await tag(id, 1);
    if (i === 0) await tag(id, 2);
  }
  await selectSkillGoal(db, student, { titleId: title.id });
  return { inst, student, title, skills, people, tag, member };
}
it('öğrenci becerisini değiştirince mezun yüzdeleri/bant değişmez; gizli beceri ilerlemeyi etkilemez', async () => {
  const w = await fixture();
  const baseline = (await getSkillGap(db, w.student)).analysis!;
  expect(baseline.missing.map((x) => x.percent)).toEqual([50, 50]);
  await w.tag(w.student, 2);
  expect((await getSkillGap(db, w.student)).analysis).toEqual(baseline);
  await w.tag(w.student, 0, true);
  const changed = (await getSkillGap(db, w.student)).analysis!;
  expect(changed.band).toBe(baseline.band);
  expect(changed.missing).toEqual(baseline.missing.filter((x) => x.id !== w.skills[0]!.id));
  expect(changed.progress).toBe(50);
  await db.profileTag.deleteMany({ where: { profile: { userId: w.student } } });
  expect((await getSkillGap(db, w.student)).analysis).toEqual(baseline);
  for (const id of w.people) expect(JSON.stringify(baseline)).not.toContain(id);
});
it('belirsiz beceri takma adı bir sözlüğe keyfi bağlanmaz; gizli grubu açmaz', async () => {
  const w = await fixture();
  const alias = w.skills[2]!.aliases[0]!;
  await db.skill.create({
    data: { name: 'Çakışan ' + randomUUID(), normalizedName: randomUUID(), aliases: [alias] },
  });
  for (const id of w.people.slice(1, 6)) await w.tag(id, 2, true);
  const result = (await getSkillGap(db, w.student)).analysis!;
  expect(result.missing.map((x) => x.id).sort()).toEqual([w.skills[0]!.id, w.skills[1]!.id].sort());
  expect(result.missing.some((x) => x.id === w.skills[2]!.id)).toBe(false);
});
it('aynı mezunun iki hedefi aynı anda büyütmesi mümkün değil; başlangıç ve kayıt sırası kararlı', async () => {
  const w = await fixture(10),
    other = await db.title.create({
      data: { name: 'Diğer ' + randomUUID(), normalizedName: randomUUID(), aliases: [] },
    });
  for (const id of w.people)
    await db.position.create({
      data: {
        userId: id,
        companyRaw: 'Başka kurum',
        titleId: other.id,
        titleRaw: other.name,
        isCurrent: true,
        source: 'MANUAL',
        startYear: 2025,
        startMonth: 2,
      },
    });
  expect((await getSkillGap(db, w.student)).analysis).toBeNull();
  await selectSkillGoal(db, w.student, { titleId: other.id });
  expect((await getSkillGap(db, w.student)).analysis?.missing.map((x) => x.percent)).toEqual([
    50, 50,
  ]);
});
it('öğrenci+mezun çift rolünde kendi gizli becerisini eklemek grupta yeni satır/ilerleme açmaz', async () => {
  const w = await fixture(10);
  await w.member(w.student);
  // On bir kişide gizli becerinin diğer sahipleri dört: kendi eklemesi eşiği beşe taşıyamamalı.
  for (const id of w.people.slice(1, 4)) await w.tag(id, 2);
  const observer = await createUser(db);
  await addMembership(db, {
    userId: observer,
    departmentId: w.inst.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await grantRequiredConsents(db, observer);
  await selectSkillGoal(db, observer, { titleId: w.title.id });
  expect(
    (await getSkillGap(db, observer)).analysis?.missing.some((x) => x.id === w.skills[2]!.id),
  ).toBe(false);
  const before = await getSkillGap(db, w.student);
  expect(before.analysis?.progress).toBe(0);
  await w.tag(w.student, 2);
  expect(await getSkillGap(db, w.student)).toEqual(before);
  expect((await getSkillGap(db, observer)).analysis?.missing).toContainEqual({
    id: w.skills[2]!.id,
    label: w.skills[2]!.name,
    percent: 45,
  });
  await db.profileTag.deleteMany({
    where: { profile: { userId: w.student }, tag: { kind: 'SKILL' } },
  });
  expect(await getSkillGap(db, w.student)).toEqual(before);
});
it('askı, silinmiş hesap, bitmiş/onaysız/yabancı üyelik ve geçmiş pozisyon kaynağı eşik dışına çıkarır', async () => {
  const w = await fixture(10),
    id = w.people[0]!;
  expect((await getSkillGap(db, w.student)).analysis).not.toBeNull();
  for (const data of [{ banned: true }, { deletedAt: new Date() }]) {
    await db.user.update({ where: { id }, data });
    expect((await getSkillGap(db, w.student)).analysis).toBeNull();
    await db.user.update({ where: { id }, data: { banned: false, deletedAt: null } });
  }
  const membership = await db.membership.findFirstOrThrow({
      where: { userId: id, role: 'ALUMNI' },
    }),
    foreign = await createInstitution(db);
  for (const data of [
    { endedAt: new Date() },
    { verificationStatus: 'PENDING' as const, verifiedAt: null, verifiedById: null },
    { departmentId: foreign.deptA1 },
  ]) {
    await db.membership.update({ where: { id: membership.id }, data });
    expect((await getSkillGap(db, w.student)).analysis).toBeNull();
    await db.membership.update({
      where: { id: membership.id },
      data: {
        endedAt: null,
        verificationStatus: 'VERIFIED',
        verifiedAt: membership.verifiedAt,
        verifiedById: membership.verifiedById,
        departmentId: w.inst.deptA1,
      },
    });
  }
  await db.position.updateMany({ where: { userId: id }, data: { isCurrent: false } });
  expect((await getSkillGap(db, w.student)).analysis).toBeNull();
});
