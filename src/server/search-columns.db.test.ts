import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getExperienceDetail, listMyExperiences } from './services/experience';
import { buildDataExport } from './services/dataExport';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser } from '@/test/fixtures';

// Üretilmiş arama sütunları şemada modellidir (`migrate dev` sürüklenmesin). `searchKeys` String görünür: istemci global
// `omit` ile bunu hiçbir sorguda varsayılan döndürmemelidir; `searchVector` Unsupported olduğundan zaten yoktur
// (docs/decisions.md). Ham SQL (arama) ikisini de okur.
const db = createTestPrisma();
let id: string;
let authorId: string;
beforeAll(async () => {
  authorId = await createUser(db);
  const departmentIdAtWrite = (await createInstitution(db)).deptA1;
  await addMembership(db, { userId: authorId, departmentId: departmentIdAtWrite, role: 'ALUMNI' });
  id = (
    await db.experience.create({
      data: {
        authorId,
        departmentIdAtWrite,
        type: 'INTERNSHIP',
        organizationName: 'Arama Sütunu A.Ş.',
      },
    })
  ).id;
});
afterAll(() => db.$disconnect());

const hasSearchColumns = (row: object) => 'searchVector' in row || 'searchKeys' in row;

describe('arama sütunları varsayılan dönmez', () => {
  it('create / findUnique / findMany / update sonuçlarında yoktur', async () => {
    expect(hasSearchColumns(await db.experience.findUniqueOrThrow({ where: { id } }))).toBe(false);
    expect((await db.experience.findMany({ where: { id } })).some(hasSearchColumns)).toBe(false);
    expect(
      hasSearchColumns(await db.experience.update({ where: { id }, data: { city: 'İstanbul' } })),
    ).toBe(false);
  });

  it('ilişki içinden (include) de dönmez', async () => {
    const author = await db.user.findFirstOrThrow({
      where: { experiences: { some: { id } } },
      include: { experiences: { where: { id } } },
    });
    expect(author.experiences.length).toBe(1);
    expect(author.experiences.some(hasSearchColumns)).toBe(false);
  });

  it('açık select ile istenirse okunur (omit yalnız varsayılanı kapatır)', async () => {
    const row = await db.experience.findUniqueOrThrow({
      where: { id },
      select: { searchKeys: true },
    });
    expect(row.searchKeys).toContain('arama sutunu');
  });

  it('ham SQL üretilmiş sütunları okur (arama bozulmaz)', async () => {
    const [row] = await db.$queryRaw<{ keys: string; hasVector: boolean }[]>`
      SELECT "searchKeys" AS keys, ("searchVector" IS NOT NULL) AS "hasVector" FROM "Experience" WHERE "id" = ${id}`;
    expect(row?.keys).toContain('arama sutunu');
    expect(row?.hasVector).toBe(true);
  });
});

it('inceleyici: üretilmiş sütuna yazılamaz ve kalıcı içerik değişmez', async () => {
  const before = await db.experience.findUniqueOrThrow({
    where: { id },
    select: { searchKeys: true, organizationName: true },
  });
  await expect(
    db.experience.update({ where: { id }, data: { searchKeys: 'forged search data' } }),
  ).rejects.toThrow();
  expect(
    await db.experience.findUniqueOrThrow({
      where: { id },
      select: { searchKeys: true, organizationName: true },
    }),
  ).toEqual(before);
});
it('inceleyici: detay, kendi listesi ve veri dökümünün hiçbir nesnesinde arama sütunu yoktur', async () => {
  const values = await Promise.all([
    getExperienceDetail(db, authorId, { experienceId: id }),
    listMyExperiences(db, authorId, {}),
    buildDataExport(db, authorId),
  ]);
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    expect(Object.keys(value)).not.toContain('searchKeys');
    expect(Object.keys(value)).not.toContain('searchVector');
    for (const child of Object.values(value)) walk(child);
  };
  values.forEach(walk);
});
