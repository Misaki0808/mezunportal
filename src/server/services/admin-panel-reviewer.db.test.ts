import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { normalizeName } from '../rules/dictionary';
import { getUserDetail, listAuditLog } from './admin-panel';
import { exportEmploymentReport } from './admin-employment';
import {
  listDictionaryEntries,
  resolveUnmatchedValue,
  updateDictionaryEntry,
  deleteDictionaryEntry,
} from './admin-dictionary';
import { addProfileSkill, suggestSkills } from './profile-content';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const marker = () => `zr${randomUUID().replaceAll('-', '').slice(0, 12)}`;
async function admin(scope: 'SYSTEM' | 'DEPARTMENT' = 'SYSTEM', consented = true) {
  const inst = await createInstitution(db),
    id = await createUser(db);
  await addMembership(db, { userId: id, departmentId: inst.deptA1, role: 'ACADEMIC' });
  await addGrant(db, {
    userId: id,
    scope,
    ...(scope === 'DEPARTMENT' ? { departmentId: inst.deptA1 } : {}),
  });
  if (consented) await grantRequiredConsents(db, id);
  return { id, inst };
}
it('inceleyici: zorunlu onaysız yönetici Excel dışa aktaramaz', async () => {
  const a = await admin('SYSTEM', false);
  await expect(exportEmploymentReport({ db }, a.id, {})).rejects.toMatchObject({
    code: 'CONSENT_REQUIRED',
  });
  expect(await db.adminAuditLog.count({ where: { actorId: a.id, action: 'DATA_EXPORT' } })).toBe(0);
});
it('inceleyici: SKILL kullanım sayısı aktif ProfileTag bağlarını sayar, eski UserSkill sayılmaz', async () => {
  const a = await admin(),
    name = `Kanonik ${marker()}`;
  const skill = await db.skill.create({
    data: { name, normalizedName: normalizeName(name), aliases: [] },
  });
  for (let i = 0; i < 2; i++) await addProfileSkill({ db }, await createUser(db), { name });
  await db.userSkill.create({
    data: {
      userId: await createUser(db),
      skillId: skill.id,
      name,
      normalizedName: normalizeName(name),
      source: 'MANUAL',
    },
  });
  const rows = await listDictionaryEntries({ db }, a.id, { kind: 'SKILL', query: name });
  expect(rows.items.find((row) => row.id === skill.id)?.usageCount).toBe(2);
});
it('inceleyici: SKILL LINK kişisel Tag bağlarını kurallı etikette birleştirir ve çiftlemez', async () => {
  const a = await admin(),
    raw = `Ozel ${marker()}`,
    name = `Kanon ${marker()}`,
    users = [await createUser(db), await createUser(db)];
  for (const id of users) await addProfileSkill({ db }, id, { name: raw });
  const skill = await db.skill.create({
    data: { name, normalizedName: normalizeName(name), aliases: [] },
  });
  await addProfileSkill({ db }, users[0]!, { name });
  const unmatched = await db.unmatchedValue.findFirstOrThrow({
    where: { kind: 'SKILL', normalizedValue: normalizeName(raw) },
  });
  await resolveUnmatchedValue({ db }, a.id, {
    id: unmatched.id,
    resolution: { type: 'LINK', entryId: skill.id },
  });
  const links = await db.profileTag.findMany({
    where: { profile: { userId: { in: users } }, tag: { kind: 'SKILL' } },
    select: { profileId: true, tag: { select: { label: true, curated: true, slug: true } } },
  });
  expect(links).toHaveLength(2);
  for (const row of links)
    expect(row.tag).toEqual({ label: name, curated: true, slug: normalizeName(name) });
  expect(await db.tag.count({ where: { kind: 'SKILL', slug: normalizeName(raw) } })).toBe(0);
});
it('inceleyici: eski audit metadata içindeki iç içe kişisel veri yanıta sızmaz', async () => {
  const a = await admin(),
    targetId = randomUUID(),
    email = `${marker()}@example.test`;
  await db.adminAuditLog.create({
    data: {
      actorId: a.id,
      action: 'DICTIONARY_CHANGE',
      targetType: 'DICTIONARY_ENTRY',
      targetId,
      metadata: { legacy: { nested: [{ value: email, phone: 5321234567 }], [email]: 'legacy' } },
    },
  });
  const page = await listAuditLog({ db }, a.id, { targetId });
  expect(JSON.stringify(page)).not.toContain(email);
  expect(JSON.stringify(page)).not.toContain('5321234567');
});
it('inceleyici: son 20 geçmiş üyelik görünürlük yetkisini kesemez', async () => {
  const a = await admin('DEPARTMENT'),
    other = await createInstitution(db),
    target = await createUser(db);
  const active = await addMembership(db, {
    userId: target,
    departmentId: a.inst.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await db.membership.update({
    where: { id: active },
    data: { createdAt: new Date('2000-01-01') },
  });
  await db.membership.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({
      userId: target,
      departmentId: other.deptA1,
      role: 'STUDENT' as const,
      verificationMethod: 'STUDENT_EMAIL' as const,
      entryYear: 2020,
      endedAt: new Date('2025-01-01'),
      createdAt: new Date(Date.UTC(2021, 0, i + 1)),
    })),
  });
  await expect(getUserDetail({ db }, a.id, { userId: target })).resolves.toMatchObject({
    id: target,
  });
});

it('inceleyici: SKILL yeniden adlandırma bağları birleştirir, silme kişisel metni koruyup öneriden çıkarır', async () => {
  const a = await admin(),
    name = `Eski ${marker()}`,
    renamed = `Yeni ${marker()}`;
  const skill = await db.skill.create({
    data: { name, normalizedName: normalizeName(name), aliases: [] },
  });
  const owner = await createUser(db),
    other = await createUser(db);
  await addProfileSkill({ db }, owner, { name });
  await addProfileSkill({ db }, other, { name: renamed });
  await updateDictionaryEntry({ db }, a.id, { kind: 'SKILL', id: skill.id, name: renamed });
  const links = () =>
    db.profileTag.findMany({
      where: { profile: { userId: { in: [owner, other] } } },
      select: { tag: { select: { label: true, curated: true } } },
    });
  expect(await links()).toEqual([
    { tag: { label: renamed, curated: true } },
    { tag: { label: renamed, curated: true } },
  ]);
  expect(
    (await listDictionaryEntries({ db }, a.id, { kind: 'SKILL', query: renamed })).items[0]
      ?.usageCount,
  ).toBe(2);
  await deleteDictionaryEntry({ db }, a.id, {
    kind: 'SKILL',
    id: skill.id,
    reason: 'Yanlış sözlük kaydı',
    confirmed: true,
  });
  expect(await links()).toEqual([
    { tag: { label: renamed, curated: false } },
    { tag: { label: renamed, curated: false } },
  ]);
  expect((await suggestSkills({ db }, owner, { query: renamed })).skills).toEqual([]);
});
