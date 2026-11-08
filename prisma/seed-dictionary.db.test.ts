import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';

import { normalizeName } from '../src/server/rules/dictionary';
import { matchDictionaryName } from '../src/server/services/cv-dictionary';
import { DICTIONARY_SEED, seedDictionary } from './seed-dictionary';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

const counts = async () => ({
  sector: await db.sector.count(),
  title: await db.title.count(),
  skill: await db.skill.count(),
  company: await db.company.count(),
});

describe('pilot sözlük seed’i (TD-011)', () => {
  it('beklenen sayıda kayıt açar; şirket YAZMAZ; tekrar koşunca değişmez (idempotent)', async () => {
    const before = await counts();
    await seedDictionary(db);
    const first = await counts();
    await seedDictionary(db);
    await seedDictionary(db);
    expect(await counts()).toEqual(first);
    expect(first.company).toBe(before.company);
    for (const name of DICTIONARY_SEED.SECTOR) {
      expect(
        await db.sector.count({ where: { normalizedName: normalizeName(name, 'SECTOR') } }),
      ).toBe(1);
    }
    expect(DICTIONARY_SEED.SECTOR).toHaveLength(10);
    expect(DICTIONARY_SEED.SKILL).toHaveLength(14);
    expect(DICTIONARY_SEED.TITLE).toHaveLength(15);
    for (const [name] of DICTIONARY_SEED.SKILL) {
      expect(
        await db.skill.count({ where: { normalizedName: normalizeName(name!, 'SKILL') } }),
      ).toBe(1);
    }
  });

  it('adlar uygulamanın normalleştirmesiyle saklanır; takma adlar da; eşleme bunları bulur', async () => {
    await seedDictionary(db);
    const analyst = await db.title.findUniqueOrThrow({
      where: { normalizedName: normalizeName('Veri Analisti', 'TITLE') },
    });
    expect(analyst.name).toBe('Veri Analisti');
    expect(analyst.aliases).toEqual([normalizeName('Data Analyst', 'TITLE')]);
    expect((await matchDictionaryName(db, 'TITLE', 'DATA ANALYST'))?.id).toBe(analyst.id);
    expect((await matchDictionaryName(db, 'TITLE', 'veri analisti'))?.id).toBe(analyst.id);
    const sql = await db.skill.findUniqueOrThrow({ where: { normalizedName: 'sql' } });
    expect((await matchDictionaryName(db, 'SKILL', 'SQL'))?.id).toBe(sql.id);
    const scrum = await db.skill.findUniqueOrThrow({
      where: { normalizedName: normalizeName('Agile/Scrum', 'SKILL') },
    });
    expect((await matchDictionaryName(db, 'SKILL', 'scrum'))?.id).toBe(scrum.id);
  });

  it('aynı türde hiçbir ad/takma ad iki kayıtta tekrar etmez', async () => {
    await seedDictionary(db);
    for (const kind of ['title', 'skill'] as const) {
      const select = { normalizedName: true, aliases: true };
      const rows =
        kind === 'title'
          ? await db.title.findMany({ select })
          : await db.skill.findMany({ select });
      const seen = new Map<string, number>();
      for (const row of rows) {
        for (const value of new Set([row.normalizedName, ...row.aliases]))
          seen.set(value, (seen.get(value) ?? 0) + 1);
      }
      for (const [value, count] of seen) expect(count, `${kind}: ${value}`).toBe(1);
    }
  });

  it('yöneticinin düzenlediği kayda dokunmaz; çakışan takma ad atlanır', async () => {
    await seedDictionary(db);
    const intern = await db.title.findUniqueOrThrow({ where: { normalizedName: 'stajyer' } });
    await db.title.update({
      where: { id: intern.id },
      data: { aliases: ['ozel takma'], name: 'Stajyer (düzenlendi)' },
    });
    await seedDictionary(db);
    expect(await db.title.findUniqueOrThrow({ where: { id: intern.id } })).toMatchObject({
      name: 'Stajyer (düzenlendi)',
      aliases: ['ozel takma'],
    });
  });

  it('yöneticinin sildiği kayıt yeniden eklenir, ama başkasının takma adıyla çakışan takma ad açılmaz', async () => {
    await seedDictionary(db);
    const mine = await db.skill.create({
      data: {
        name: `Özel ${randomUUID().slice(0, 6)}`,
        normalizedName: `ozel-${randomUUID().slice(0, 6)}`,
        aliases: ['scrum master'],
      },
    });
    expect(mine.id).toBeTruthy();
    const tableau = await db.skill.findUniqueOrThrow({ where: { normalizedName: 'tableau' } });
    await db.skill.delete({ where: { id: tableau.id } });
    await seedDictionary(db);
    expect(await db.skill.count({ where: { normalizedName: 'tableau' } })).toBe(1);
  });
});
