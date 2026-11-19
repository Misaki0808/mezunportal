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
import {
  COMPANY_PAGE_SIZE,
  COMPANY_POSTING_LIMIT,
  companyDetailSchema,
} from '@/contracts/companies';
import { letterMarker } from '@/test/markers';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
async function setup() {
  const institution = await createInstitution(db);
  const other = await createInstitution(db);
  const viewer = await createUser(db);
  await addMembership(db, {
    userId: viewer,
    departmentId: institution.deptA1,
    role: 'STUDENT',
    entryYear: 2023,
  });
  await grantRequiredConsents(db, viewer);
  const key = letterMarker('', 8);
  const company = await db.company.create({
    data: { name: `Örnek ${key}`, normalizedName: `ornek ${key}`, aliases: [`takma ${key}`] },
    select: { id: true, name: true },
  });
  const slug = companySlug(company.name, company.id);
  return { institution, other, viewer, company, slug, key };
}
async function published(
  companyId: string,
  departmentId: string,
  authorId: string,
  anonymous: boolean,
  season: 'SPRING' | 'SUMMER' = 'SUMMER',
) {
  const moderator = await createUser(db);
  return db.experience.create({
    data: {
      authorId,
      departmentIdAtWrite: departmentId,
      companyId,
      organizationName: 'Örnek',
      type: 'INTERNSHIP',
      durationWeeks: 8,
      pay: 'PAID',
      applicationChannel: 'REFERRAL',
      status: 'PUBLISHED',
      moderatedAt: new Date(),
      publishedAt: new Date(),
      moderatedById: moderator,
      isAnonymous: anonymous,
      termYear: 2025,
      termSeason: season,
      whatLearned: 'Genel deneyim',
      advice: 'Genel öneri',
    },
    select: { id: true },
  });
}
async function alumni(companyId: string, departmentId: string, name: string, current = true) {
  const userId = await createUser(db, { name });
  await addMembership(db, { userId, departmentId, role: 'ALUMNI', graduationYear: 2020 });
  await db.position.create({
    data: {
      userId,
      companyId,
      companyRaw: 'Örnek',
      titleRaw: 'Analist',
      source: 'MANUAL',
      isCurrent: current,
    },
  });
  return userId;
}
it('arama takma adı bulur; k<3 sayı ve dönem döndürülmez; üniversite dışı kayıtlar sayıma girmez', async () => {
  const w = await setup();
  const a = await alumni(w.company.id, w.institution.deptA1, 'Mezun A');
  const b = await alumni(w.company.id, w.institution.deptA1, 'Mezun B');
  await addMentorProfile(db, a);
  await alumni(w.company.id, w.other.deptA1, 'Yabancı');
  await published(w.company.id, w.institution.deptA1, a, false);
  await published(w.company.id, w.institution.deptA1, b, false);
  await published(w.company.id, w.institution.deptA1, a, false);
  await published(w.company.id, w.other.deptA1, b, false);
  let page = await getCompany({ db }, w.viewer, w.slug);
  expect(page.alumni.current).toBeNull();
  expect(page.mentors.map((m) => m.userId)).toContain(a);
  expect(page.periods).toEqual([]);
  expect(page.experiences).toHaveLength(3);
  const c = await alumni(w.company.id, w.institution.deptA1, 'Mezun C');
  await published(w.company.id, w.institution.deptA1, c, false);
  const posting = await db.jobPosting.create({
    data: {
      authorId: c,
      departmentIdAtWrite: w.institution.deptA1,
      companyId: w.company.id,
      title: 'Staj ilanı',
      organizationName: 'Örnek',
      description: 'Öğrenciler için örnek bir staj pozisyonu açıklaması.',
      isRemote: true,
      applyMethod: 'URL',
      applyUrl: 'https://example.org',
      status: 'PUBLISHED',
      submittedAt: new Date(),
      moderatedAt: new Date(),
      moderatedById: w.viewer,
      publishedAt: new Date(),
      deadlineOn: new Date(Date.now() + 86400 * 14 * 1000),
      targets: { create: [{ departmentId: w.institution.deptA1 }] },
    },
    select: { id: true },
  });
  page = await getCompany({ db }, w.viewer, w.slug);
  expect(page.alumni.current).toBe(3);
  expect(page.postings.map((p) => p.id)).toContain(posting.id);
  expect(companyDetailSchema.safeParse({ ...page, rating: 5 }).success).toBe(false);
  expect(page.periods).toEqual([{ season: 'SUMMER', count: 4 }]);
  expect(
    (await searchCompanies({ db }, w.viewer, `takma ${w.key}`)).companies.map((x) => x.id),
  ).toContain(w.company.id);
  await db.user.update({ where: { id: c }, data: { banned: true } });
  page = await getCompany({ db }, w.viewer, w.slug);
  expect(page.alumni.current).toBeNull();
  expect(page.postings.map((p) => p.id)).not.toContain(posting.id);
});
it('anonim yazar kesişimi: diğer tüm adaylar bilinse de dönem, sayı ve mentor kümesi yazarı ele vermez', async () => {
  const w = await setup();
  const names = ['Anonim Gizli Yazar', 'Bilinen Mezun', 'Başka Mezun'];
  const users = [];
  for (const name of names) users.push(await alumni(w.company.id, w.institution.deptA1, name));
  await addMentorProfile(db, users[0]!);
  await published(w.company.id, w.institution.deptA1, users[0]!, true, 'SUMMER');
  await published(w.company.id, w.institution.deptA1, users[1]!, false, 'SUMMER');
  await published(w.company.id, w.institution.deptA1, users[2]!, false, 'SUMMER');
  const result = await getCompany({ db }, w.viewer, w.slug);
  const text = JSON.stringify(result);
  expect(text).not.toContain(users[0]);
  expect(text).not.toContain(names[0]);
  expect(result.experiences.find((e) => e.isAnonymous)).not.toHaveProperty('author');
  expect(result.alumni).toEqual({ current: null, former: null });
  expect(result.periods).toEqual([]);
  expect(result.mentors).toEqual([]);
});
it('şirket birleştirme bağlantıları taşır, audit yazar, tekrar aynı sonucu verir', async () => {
  const w = await setup();
  const admin = await createUser(db);
  await addMembership(db, { userId: admin, departmentId: w.institution.deptA1, role: 'ACADEMIC' });
  await addGrant(db, { userId: admin, scope: 'SYSTEM' });
  await grantRequiredConsents(db, admin);
  const target = await db.company.create({
    data: { name: `Hedef ${w.key}`, normalizedName: `hedef ${w.key}`, aliases: [] },
    select: { id: true },
  });
  const userId = await alumni(w.company.id, w.institution.deptA1, 'Mezun');
  await db.companyFollow.create({ data: { userId: w.viewer, companyId: w.company.id } });
  const experience = await published(w.company.id, w.institution.deptA1, userId, false);
  const posting = await db.jobPosting.create({
    data: { authorId: userId, departmentIdAtWrite: w.institution.deptA1, companyId: w.company.id },
    select: { id: true },
  });
  expect(await mergeCompanies({ db }, admin, w.company.id, target.id)).toEqual({
    targetId: target.id,
    alreadyMerged: false,
  });
  expect(await mergeCompanies({ db }, admin, w.company.id, target.id)).toEqual({
    targetId: target.id,
    alreadyMerged: true,
  });
  expect(
    (
      await db.experience.findUniqueOrThrow({
        where: { id: experience.id },
        select: { companyId: true },
      })
    ).companyId,
  ).toBe(target.id);
  expect(await db.position.count({ where: { userId, companyId: target.id } })).toBe(1);
  expect(await db.companyFollow.count({ where: { userId: w.viewer, companyId: target.id } })).toBe(
    1,
  );
  expect(
    (
      await db.jobPosting.findUniqueOrThrow({
        where: { id: posting.id },
        select: { companyId: true },
      })
    ).companyId,
  ).toBe(target.id);
  expect(
    await db.adminAuditLog.count({ where: { targetId: target.id, action: 'DICTIONARY_CHANGE' } }),
  ).toBe(1);
  expect((await getCompany({ db }, w.viewer, w.slug)).id).toBe(target.id);
});

it('şirket listesi sayfalanır: 40 + kalan, adlar Türkçe sırayla, aralık dışı sayfa son sayfaya çekilir', async () => {
  const w = await setup();
  const turkish = [
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
  const tail = Array.from({ length: 16 }, (_, n) => `Zzz ${String(n).padStart(2, '0')}`);
  const expected = [...turkish, ...tail];
  for (const name of [...expected].reverse())
    await db.company.create({
      data: {
        name: `${name} ${w.key}`,
        normalizedName: `${name.toLowerCase()} ${w.key}`,
        aliases: [],
      },
    });
  const first = await searchCompanies({ db }, w.viewer, w.key);
  const second = await searchCompanies({ db }, w.viewer, w.key, 2);
  expect(first.total).toBe(expected.length + 1); // + kurulumdaki "Örnek" şirketi (adında aynı işaret var)
  expect(first.pageSize).toBe(COMPANY_PAGE_SIZE);
  expect(first.companies).toHaveLength(COMPANY_PAGE_SIZE);
  expect(second.companies).toHaveLength(expected.length + 1 - COMPANY_PAGE_SIZE);
  const names = [...first.companies, ...second.companies].map((c) =>
    c.name.replace(` ${w.key}`, ''),
  );
  expect(new Set(names).size).toBe(names.length);
  // "Örnek" Türkçe sırada Ö'dür (Orhan'dan sonra, Pelin'dan önce); diğerleri beklenen sırada.
  const withOrnek = [
    ...turkish.slice(0, turkish.indexOf('Pelin')),
    'Örnek',
    ...turkish.slice(turkish.indexOf('Pelin')),
    ...tail,
  ];
  expect(names).toEqual(withOrnek);
  const beyond = await searchCompanies({ db }, w.viewer, w.key, 9);
  expect(beyond.page).toBe(2);
  expect(beyond.companies.map((c) => c.id)).toEqual(second.companies.map((c) => c.id));
});

it('şirket sayfasında yalnız en yeni ilk ilanlar gelir; toplam sayı ayrı verilir', async () => {
  const w = await setup();
  const author = await alumni(w.company.id, w.institution.deptA1, 'İlan Sahibi');
  const total = COMPANY_POSTING_LIMIT + 2;
  for (let n = 0; n < total; n += 1)
    await db.jobPosting.create({
      data: {
        authorId: author,
        departmentIdAtWrite: w.institution.deptA1,
        companyId: w.company.id,
        title: `Sınır ilanı ${n}`,
        organizationName: 'Örnek',
        description: 'Öğrenciler için örnek bir staj pozisyonu açıklaması.',
        isRemote: true,
        applyMethod: 'URL',
        applyUrl: 'https://example.org',
        status: 'PUBLISHED',
        submittedAt: new Date(),
        moderatedAt: new Date(),
        moderatedById: w.viewer,
        publishedAt: new Date(Date.now() - n * 60_000),
        deadlineOn: new Date(Date.now() + 86400 * 14 * 1000),
        targets: { create: [{ departmentId: w.institution.deptA1 }] },
      },
    });
  const page = await getCompany({ db }, w.viewer, w.slug);
  expect(page.postings).toHaveLength(COMPANY_POSTING_LIMIT);
  expect(page.postingTotal).toBe(total);
  expect(page.postings[0]?.title).toBe('Sınır ilanı 0'); // en yeni başta
});
