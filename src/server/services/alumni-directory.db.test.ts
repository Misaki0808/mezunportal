import { afterAll, expect, it, vi } from 'vitest';
import { alumniSearchSchema } from '@/contracts/alumni-directory';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser } from '@/test/fixtures';
import { letterMarker } from '@/test/markers';
import { loadActor } from '../permissions/actor';
import { normalizeName } from '../rules/dictionary';
import { searchAlumni } from './alumni-directory';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
it('yalnız aynı üniversitedeki katılmış ve doğrulanmış mezunu döndürür; süzgeçler daraltır ve iletişim alanları yanıta girmez', async () => {
  const one = await createInstitution(db);
  const other = await createInstitution(db);
  const viewer = await createUser(db);
  await addMembership(db, {
    userId: viewer,
    departmentId: one.deptA1,
    role: 'STUDENT',
    entryYear: 2020,
  });
  const mk = async (departmentId: string, visible: boolean, name: string) => {
    const userId = await createUser(db, { name });
    await addMembership(db, { userId, departmentId, role: 'ALUMNI', graduationYear: 2021 });
    await db.profile.create({
      data: { userId, alumniDirectoryVisible: visible, city: 'İstanbul' },
    });
    return userId;
  };
  const key = letterMarker('', 8);
  const visible = await mk(one.deptA1, true, `Havacı ${key}`);
  const hidden = await mk(one.deptA1, false, `Havacı ${key}`);
  const foreign = await mk(other.deptA1, true, `Havacı ${key}`);
  const defense = await mk(one.deptA1, true, `Havacı ${key}`);
  const suspended = await mk(one.deptA1, true, `Havacı ${key}`);
  await db.user.update({ where: { id: suspended }, data: { banned: true } });
  const unverified = await createUser(db, { name: `Havacı ${key}` });
  await addMembership(db, {
    userId: unverified,
    departmentId: one.deptA1,
    role: 'ALUMNI',
    graduationYear: 2021,
    status: 'PENDING',
  });
  await db.profile.create({
    data: { userId: unverified, alumniDirectoryVisible: true, city: 'İstanbul' },
  });
  const aviation = await db.sector.create({
    data: { name: `Havacılık ${key}`, normalizedName: `havacilik ${key}` },
  });
  const military = await db.sector.create({
    data: { name: `Savunma ${key}`, normalizedName: `savunma ${key}` },
  });
  const parentCompany = await db.company.create({
    data: {
      name: `Grup ${key}`,
      normalizedName: `group ${key}`,
      sectorId: aviation.id,
      aliases: [],
    },
  });
  for (const [id, sectorId] of [
    [visible, aviation.id],
    [hidden, aviation.id],
    [foreign, aviation.id],
    [suspended, aviation.id],
    [unverified, aviation.id],
    [defense, military.id],
  ]) {
    await db.position.create({
      data: {
        userId: id!,
        sectorId,
        companyRaw: `Hava ${key}`,
        titleRaw: 'Analist',
        source: 'MANUAL',
        isCurrent: true,
        ...(id === defense ? { companyId: parentCompany.id } : {}),
      },
    });
  }
  // Geçmişte havacılıkta çalışmış savunma çalışanı, bugünkü havacılık sonucuna girmez.
  await db.position.create({
    data: {
      userId: defense,
      sectorId: aviation.id,
      companyRaw: `Eski ${key}`,
      titleRaw: 'Analist',
      source: 'MANUAL',
      isCurrent: false,
    },
  });
  const skillName = `Beceri ${key}`;
  const skillAlias = `Takma ${key}`;
  await db.skill.create({
    data: {
      name: skillName,
      normalizedName: normalizeName(skillName, 'SKILL'),
      aliases: [normalizeName(skillAlias, 'SKILL')],
    },
  });
  const skillTag = await db.tag.create({
    data: { kind: 'SKILL', slug: normalizeName(skillName, 'SKILL'), label: skillName },
  });
  const visibleProfile = await db.profile.findUniqueOrThrow({ where: { userId: visible } });
  await db.profileTag.create({ data: { profileId: visibleProfile.id, tagId: skillTag.id } });
  const actor = (await loadActor(db, viewer, new Date()))!;
  const get = (filter: object) => searchAlumni(db, actor, alumniSearchSchema.parse(filter));
  const result = await get({
    q: key,
    sectorId: aviation.id,
    company: 'Hava',
    title: 'Analist',
    city: 'İstanbul',
    graduationFrom: 2020,
    graduationTo: 2022,
  });
  expect(result.items.map((item) => item.userId)).toEqual([visible]);
  expect((await get({ q: key, skill: skillAlias })).items.map((item) => item.userId)).toEqual([
    visible,
  ]);
  expect(JSON.stringify(result)).not.toMatch(/email|phone|linkedin|socialLinks/i);
  expect((await get({ q: key, sectorId: military.id })).items.map((item) => item.userId)).toEqual([
    defense,
  ]);
  expect((await get({ q: key, graduationTo: 2020 })).total).toBe(0);
  expect((await get({ q: '%%' })).total).toBe(0);
  await db.profile.update({ where: { userId: visible }, data: { alumniDirectoryVisible: false } });
  expect((await get({ q: key, sectorId: aviation.id })).total).toBe(0);
});

it('kendini, silinenleri, bitmiş üyeliği ve öğrenci rolünü rehberde göstermez; q eski işveren veya unvanı aramaz', async () => {
  const institution = await createInstitution(db);
  const key = letterMarker('', 8);
  const viewer = await createUser(db, { name: `Kendi ${key}` });
  await addMembership(db, { userId: viewer, departmentId: institution.deptA1, role: 'ALUMNI' });
  await db.profile.create({ data: { userId: viewer, alumniDirectoryVisible: true } });

  const makePerson = async (role: 'ALUMNI' | 'STUDENT', name: string, endedAt?: Date) => {
    const userId = await createUser(db, { name });
    await addMembership(db, { userId, departmentId: institution.deptA1, role, endedAt });
    await db.profile.create({ data: { userId, alumniDirectoryVisible: true } });
    return userId;
  };
  const deleted = await makePerson('ALUMNI', `Silinmiş ${key}`);
  await db.user.update({ where: { id: deleted }, data: { deletedAt: new Date() } });
  const ended = await makePerson('ALUMNI', `Bitmiş ${key}`, new Date());
  const student = await makePerson('STUDENT', `Öğrenci ${key}`);
  const valid = await makePerson('ALUMNI', `Geçerli ${key}`);
  await db.position.create({
    data: {
      userId: valid,
      companyRaw: `Eskiişveren${key}`,
      titleRaw: `Eskiunvan${key}`,
      isCurrent: false,
      source: 'MANUAL',
    },
  });
  const actor = (await loadActor(db, viewer, new Date()))!;
  const get = (q: string) => searchAlumni(db, actor, alumniSearchSchema.parse({ q }));
  const result = await get(key);
  expect(result.items.map((item) => item.userId)).toEqual([valid]);
  expect(result.items.map((item) => item.userId)).not.toContain(viewer);
  expect(result.items.map((item) => item.userId)).not.toContain(deleted);
  expect(result.items.map((item) => item.userId)).not.toContain(ended);
  expect(result.items.map((item) => item.userId)).not.toContain(student);
  expect((await get(`Eskiişveren${key}`)).total).toBe(0);
  expect((await get(`Eskiunvan${key}`)).total).toBe(0);
});

it('adlar Türkçe harf sırasıyla gelir (ç, ğ, ı/i, ö, ş, ü); sayfalar arası çift/eksik yok; aralık dışı sayfa son sayfaya çekilir', async () => {
  const institution = await createInstitution(db);
  const viewer = await createUser(db);
  await addMembership(db, {
    userId: viewer,
    departmentId: institution.deptA1,
    role: 'STUDENT',
    entryYear: 2020,
  });
  // Türkçe alfabe sırası; veritabanının varsayılan (kod noktası) sırasında Ç, Ğ, İ, Ö, Ş, Ü en sona düşerdi.
  const expected = [
    'Ada',
    'Bora',
    'Cem',
    'Çağla',
    'Deniz',
    'Ece',
    'Fatma',
    'Gül',
    'Ğ. Ali',
    'Hale',
    'Işık',
    'İpek',
    'Jale',
    'Kaan',
    'Leyla',
    'Mert',
    'Nur',
    'Orhan',
    'Ömer',
    'Pelin',
    'Rıza',
    'Selin',
    'Şule',
    'Tolga',
    'Ulaş',
    'Ümit',
    'Veli',
    'Yağmur',
    'Zeynep',
  ];
  const key = letterMarker('', 6);
  for (const name of [...expected].reverse()) {
    const userId = await createUser(db, { name: `${name} ${key}` });
    await addMembership(db, {
      userId,
      departmentId: institution.deptA1,
      role: 'ALUMNI',
      graduationYear: 2021,
    });
    await db.profile.create({ data: { userId, alumniDirectoryVisible: true, city: 'İstanbul' } });
  }
  const actor = (await loadActor(db, viewer, new Date()))!;
  const first = await searchAlumni(db, actor, alumniSearchSchema.parse({ q: key }));
  const second = await searchAlumni(db, actor, alumniSearchSchema.parse({ q: key, page: 2 }));
  const names = [...first.items, ...second.items].map((item) => item.name.replace(` ${key}`, ''));
  expect(first.total).toBe(expected.length);
  expect(first.items).toHaveLength(24);
  expect(names).toEqual(expected);
  const beyond = await searchAlumni(db, actor, alumniSearchSchema.parse({ q: key, page: 9 }));
  expect(beyond.page).toBe(2);
  expect(beyond.items.map((item) => item.userId)).toEqual(second.items.map((item) => item.userId));
});

it('rehberden çıkma, kimlik seçimi ile son okuma arasında tamamlanırsa o kişi sayfadan düşer; yeni ad dönmez', async () => {
  const institution = await createInstitution(db);
  const viewer = await createUser(db);
  const alumnus = await createUser(db, { name: 'Önceki Ad' });
  await addMembership(db, {
    userId: viewer,
    departmentId: institution.deptA1,
    role: 'STUDENT',
    entryYear: 2020,
  });
  await addMembership(db, {
    userId: alumnus,
    departmentId: institution.deptA1,
    role: 'ALUMNI',
    graduationYear: 2021,
  });
  await db.profile.create({ data: { userId: alumnus, alumniDirectoryVisible: true } });
  const actor = (await loadActor(db, viewer, new Date()))!;
  const original = db.user.findMany.bind(db.user);
  let hidden = false;
  type Args = { select?: { id?: boolean; name?: boolean } };
  const spy = vi.spyOn(db.user, 'findMany').mockImplementation((async (args: Args) => {
    const rows = await original(args as never);
    // Kimlik ön-seçimi bitti (yalnız `id` seçen sorgu): kişi rehberden çıkar ve adını değiştirir.
    if (!hidden && args?.select?.id === true && !args?.select?.name) {
      hidden = true;
      await db.$transaction([
        db.profile.update({ where: { userId: alumnus }, data: { alumniDirectoryVisible: false } }),
        db.user.update({ where: { id: alumnus }, data: { name: 'Gizlendikten Sonra Yeni Ad' } }),
      ]);
    }
    return rows;
  }) as never);
  try {
    const result = await searchAlumni(db, actor, alumniSearchSchema.parse({}));
    expect(hidden).toBe(true);
    expect(result.items.map((item) => item.name)).not.toContain('Gizlendikten Sonra Yeni Ad');
    expect(result.items).toHaveLength(0);
  } finally {
    spy.mockRestore();
  }
});
