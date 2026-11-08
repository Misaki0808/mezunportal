import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

import { deleteAccount } from './accountDeletion';
import { buildDataExport } from './dataExport';
import { addProfileSkill } from './profile-content';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const tag = () => `zx${randomUUID().replace(/-/g, '').slice(0, 10)}`;

describe('beceri taşıma migration’ı (UserSkill → Tag + ProfileTag)', () => {
  const sql = readFileSync(
    new URL(
      '../../../prisma/migrations/20261108020000_p1_06_skill_tags/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const copy = sql.slice(sql.indexOf('-- Eski kullanıcı becerilerini taşı'));

  it('sözlük eşleşmesi kurallı etiket, eşleşmeyen kişisel etiket olur; profil yoksa açılır; tekrar çalıştırmak çiftlemez', async () => {
    const t = tag();
    const canonical = `Kanon${t}`;
    const skill = await db.skill.create({
      data: { name: canonical, normalizedName: canonical.toLowerCase(), aliases: [] },
    });
    const withProfile = await createUser(db);
    const withoutProfile = await createUser(db);
    await db.profile.create({ data: { userId: withProfile } });
    await db.userSkill.createMany({
      data: [
        {
          userId: withProfile,
          skillId: skill.id,
          name: `kanon ${t} yazimi`,
          normalizedName: `kanon ${t} yazimi`,
          source: 'CV',
        },
        {
          userId: withoutProfile,
          skillId: skill.id,
          name: 'TS',
          normalizedName: 'ts',
          source: 'CV',
        },
        {
          userId: withoutProfile,
          skillId: null,
          name: `Kişisel ${t}`,
          normalizedName: `kisisel ${t}`,
          source: 'CV',
        },
      ],
    });
    for (let run = 0; run < 2; run += 1) {
      for (const statement of copy
        .split(/;\s*\n/)
        .map((part) => part.trim())
        .filter(Boolean)) {
        await db.$executeRawUnsafe(statement.replace(/--[^\n]*\n/g, ''));
      }
    }
    const labelsOf = async (userId: string) =>
      (
        await db.profileTag.findMany({
          where: { profile: { userId }, tag: { kind: 'SKILL' } },
          select: { tag: { select: { label: true, curated: true } } },
        })
      )
        .map((row) => `${row.tag.label}:${row.tag.curated}`)
        .sort();
    expect(await labelsOf(withProfile)).toEqual([`${canonical}:true`]);
    expect(await labelsOf(withoutProfile)).toEqual(
      [`${canonical}:true`, `Kişisel ${t}:false`].sort(),
    );
    expect(await db.tag.count({ where: { kind: 'SKILL', label: canonical } })).toBe(1);
  });
});

describe('beceri etiketleri ve hesap silme / döküm', () => {
  it('hesap silinince kişisel beceri etiketi geride kalmaz, kurallı etiket ve başkasının bağı kalır; döküm becerileri içerir', async () => {
    const t = tag();
    const owner = await createUser(db);
    const friend = await createUser(db);
    const canonical = `Kural${t}`;
    await db.skill.create({
      data: { name: canonical, normalizedName: canonical.toLowerCase(), aliases: [] },
    });
    const deps = { db };
    await addProfileSkill(deps, owner, { name: `Kisisel${t}` });
    await addProfileSkill(deps, owner, { name: canonical });
    await addProfileSkill(deps, friend, { name: canonical });
    const exported = await buildDataExport(db, owner);
    expect(exported.cv.skills.map((row) => row.name).sort()).toEqual(
      [canonical, `Kisisel${t}`].sort(),
    );

    const email = (await db.user.findUniqueOrThrow({ where: { id: owner } })).email;
    await deleteAccount(
      db,
      owner,
      { publishedContent: 'DELETE', confirmEmail: email },
      { removeStoredFiles: async () => undefined },
    );
    expect(await db.tag.count({ where: { kind: 'SKILL', label: `Kisisel${t}` } })).toBe(0);
    expect(await db.tag.count({ where: { kind: 'SKILL', label: canonical } })).toBe(1);
    expect(
      await db.profileTag.count({
        where: { profile: { userId: friend }, tag: { label: canonical } },
      }),
    ).toBe(1);
    expect(await db.profile.count({ where: { userId: owner } })).toBe(0);
  });
});
