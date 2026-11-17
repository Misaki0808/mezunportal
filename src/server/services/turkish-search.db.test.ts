import { afterAll, beforeAll, expect, it } from 'vitest';
import { alumniSearchSchema } from '@/contracts/alumni-directory';
import { searchMentorsSchema } from '@/contracts/mentor-directory';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
  unique,
} from '@/test/fixtures';
import { loadActor } from '../permissions/actor';
import { searchMentors } from './mentor-directory';
import { searchAlumni } from './alumni-directory';
import { searchUsers } from './admin-panel';
import { listCourseGuide } from './course-guide';
import { settleEvents } from './event';
import { matchingDirectoryText } from '../repositories/turkish-filters';
import { normalizeName } from '../rules/dictionary';

const db = createTestPrisma();
const WORDS = 'YILDIZ İSTANBUL ÇIĞ ÖZGÜR IŞIK';
const variants = [
  'yıldız',
  'YILDIZ',
  'yildiz',
  'Yıldız',
  'istanbul',
  'İSTANBUL',
  'cig',
  'ozgur',
  'isik',
];
let viewer: string, owner: string, admin: string, course: string, canonical: string, banned: string;
let departmentId: string, universityId: string, foreign: string;
beforeAll(async () => {
  const inst = await createInstitution(db);
  departmentId = inst.deptA1;
  universityId = inst.universityId;
  viewer = await createUser(db);
  await addMembership(db, { userId: viewer, departmentId, role: 'STUDENT', entryYear: 2024 });
  await grantRequiredConsents(db, viewer);
  admin = await createUser(db);
  await addMembership(db, { userId: admin, departmentId, role: 'ACADEMIC' });
  await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId });
  await grantRequiredConsents(db, admin);
  const make = async (departmentId: string, name: string, visible = true) => {
    const id = await createUser(db, { name });
    await addMembership(db, { userId: id, departmentId, role: 'ALUMNI', graduationYear: 2022 });
    await db.profile.create({ data: { userId: id, alumniDirectoryVisible: visible, city: WORDS } });
    await db.mentorProfile.create({
      data: { userId: id, isActive: true, monthlyCapacity: 4, sessionMinutes: 30 },
    });
    return id;
  };
  owner = await make(departmentId, WORDS);
  await addMembership(db, { userId: owner, departmentId, role: 'ACADEMIC' });
  await db.position.create({
    data: { userId: owner, companyRaw: WORDS, titleRaw: WORDS, isCurrent: true, source: 'MANUAL' },
  });
  foreign = await make((await createInstitution(db)).deptA1, WORDS);
  await db.position.create({
    data: {
      userId: foreign,
      companyRaw: WORDS,
      titleRaw: WORDS,
      isCurrent: true,
      source: 'MANUAL',
    },
  });
  banned = await make(departmentId, WORDS);
  await db.user.update({ where: { id: banned }, data: { banned: true } });
  canonical = await make(departmentId, 'Başka Mezun');
  const company = await db.company.create({
    data: { name: 'ÇÖĞÜŞ İLERİ', normalizedName: 'canonical-company-399' },
  });
  const title = await db.title.create({
    data: { name: 'ÇÖĞÜŞ İLERİ', normalizedName: 'canonical-title-399' },
  });
  await db.position.create({
    data: {
      userId: canonical,
      companyRaw: 'Ham firma',
      titleRaw: 'Ham görev',
      companyId: company.id,
      titleId: title.id,
      isCurrent: true,
      source: 'MANUAL',
    },
  });
  course = (
    await db.course.create({
      data: { departmentId, code: 'TR399', name: WORDS, semester: 1, elective: true },
    })
  ).id;
  await db.course.create({
    data: { departmentId: inst.deptB1, code: 'TR399', name: WORDS, semester: 1, elective: true },
  });
});
afterAll(async () => {
  await settleEvents();
  await db.$disconnect();
});
const actor = async () => (await loadActor(db, viewer, new Date()))!;
const mentors = async (filter: object) =>
  searchMentors({ db }, await actor(), searchMentorsSchema.parse(filter));
const alumni = async (filter: object) =>
  searchAlumni(db, await actor(), alumniSearchSchema.parse(filter));

it.each(variants)(
  'mentor ve mezun dizini: %s bütün metin alanlarında aynı görünür kişiyi bulur',
  async (query) => {
    for (const key of ['q', 'company', 'title'] as const) {
      expect((await mentors({ [key]: query })).items.map((x) => x.userId)).toEqual([owner]);
      expect((await alumni({ [key]: query })).items.map((x) => x.userId)).toEqual([owner]);
    }
    expect((await alumni({ city: query })).items.map((x) => x.userId).sort()).toEqual(
      [owner, canonical].sort(),
    );
  },
);
it.each(variants)('yönetim ve ders rehberi: %s kapsamı genişletmez', async (query) => {
  expect((await searchUsers({ db }, admin, { query })).items.map((x) => x.id).sort()).toEqual(
    [owner, banned].sort(),
  );
  expect((await listCourseGuide(db, viewer, { query })).map((x) => x.id)).toEqual([course]);
});
it('sözlüğe bağlı şirket ve unvan da aynı katlamadan geçer', async () => {
  for (const key of ['q', 'company', 'title'] as const) {
    expect((await mentors({ [key]: 'cogus ileri' })).items.map((x) => x.userId)).toEqual([
      canonical,
    ]);
    expect((await alumni({ [key]: 'cogus ileri' })).items.map((x) => x.userId)).toEqual([
      canonical,
    ]);
  }
});
it('LIKE işaretleri ve SQL metni her yerde düz metindir; eşleşme yoksa liste genişlemez', async () => {
  for (const query of ['%%', '__', '\\\\', "%' OR true --"]) {
    expect((await mentors({ q: query })).items).toEqual([]);
    expect((await alumni({ q: query })).items).toEqual([]);
    expect((await searchUsers({ db }, admin, { query })).items).toEqual([]);
    expect(await listCourseGuide(db, viewer, { query })).toEqual([]);
  }
});
it('mentor şirket/unvan araması geçmiş pozisyonla eşleşmez; güncel kartla tutarlıdır', async () => {
  await db.position.create({
    data: {
      userId: owner,
      companyRaw: 'GEÇMİŞ HOLDİNG',
      titleRaw: 'GEÇMİŞ UZMAN',
      isCurrent: false,
      source: 'MANUAL',
    },
  });
  for (const filter of [{ q: 'gecmis' }, { company: 'gecmis' }, { title: 'gecmis' }]) {
    expect((await mentors(filter)).items).toEqual([]);
    expect((await alumni(filter)).items).toEqual([]);
  }
});
it('mentor q olayında yalnız anahtar adı saklanır; ham metin props içinde yoktur', async () => {
  await settleEvents();
  await db.event.deleteMany({ where: { userId: viewer, type: 'MENTOR_SEARCH' } });
  await mentors({ q: 'yıldız' });
  await settleEvents();
  const events = await db.event.findMany({
    where: { userId: viewer, type: 'MENTOR_SEARCH' },
    select: { props: true },
  });
  expect(events).toEqual([{ props: { filters: ['q'], results: 'FEW' } }]);
  expect(JSON.stringify(events)).not.toContain('yıldız');
});

it('şirketin dört hukuki ek yazımı ve noktalı unvan aynı sözlük kişisini bulur', async () => {
  const marker = unique('turkish413').replace(/[^a-z0-9]/gi, '');
  const id = await createUser(db, { name: 'Sözlük Deneyi' });
  await addMembership(db, { userId: id, departmentId, role: 'ALUMNI', graduationYear: 2022 });
  await db.profile.create({ data: { userId: id, alumniDirectoryVisible: true } });
  await db.mentorProfile.create({
    data: { userId: id, isActive: true, monthlyCapacity: 4, sessionMinutes: 30 },
  });
  const company = await db.company.create({
    data: {
      name: `${marker} Örnek Yazılım A.Ş.`,
      normalizedName: normalizeName(`${marker} Örnek Yazılım A.Ş.`, 'COMPANY'),
    },
  });
  const title = await db.title.create({
    data: {
      name: `${marker} Yazılım Mühendisi`,
      normalizedName: normalizeName(`${marker} Yazılım Mühendisi`, 'TITLE'),
    },
  });
  await db.position.create({
    data: {
      userId: id,
      companyId: company.id,
      titleId: title.id,
      companyRaw: 'Ham kurum',
      titleRaw: 'Ham unvan',
      isCurrent: true,
      source: 'MANUAL',
    },
  });
  for (const company of [
    'Örnek Yazılım A.Ş.',
    'ornek yazilim as',
    'Örnek Yazılım AŞ',
    'Ornek Yazilim A S',
  ]) {
    for (const key of ['company', 'q']) {
      expect((await mentors({ [key]: `${marker} ${company}` })).items.map((x) => x.userId)).toEqual(
        [id],
      );
      expect((await alumni({ [key]: `${marker} ${company}` })).items.map((x) => x.userId)).toEqual([
        id,
      ]);
    }
  }
  for (const key of ['title', 'q']) {
    expect((await mentors({ [key]: `${marker} yazilim muh.` })).items.map((x) => x.userId)).toEqual(
      [id],
    );
    expect((await alumni({ [key]: `${marker} yazilim muh.` })).items.map((x) => x.userId)).toEqual([
      id,
    ]);
  }
  for (const filter of [
    { company: `${marker} ornek yazilim as`, title: `${marker} yazilim muh.` },
    { company: 'Ham kurum', title: `${marker} yazilim muh.` },
    { company: `${marker} ornek yazilim as`, title: 'Ham unvan' },
    { company: 'Ham kurum', title: 'Ham unvan' },
  ]) {
    expect((await mentors(filter)).items.map((item) => item.userId)).toEqual([id]);
    expect((await alumni(filter)).items.map((item) => item.userId)).toEqual([id]);
  }
  for (const query of ['...', '%%', '__', 'ornek%yazilim', 'ornek_yazilim']) {
    expect((await mentors({ company: query })).items).toEqual([]);
    expect((await alumni({ company: query })).items).toEqual([]);
  }
});
it('eşleşme deposu yabancı üniversite kimliklerini uygulamaya taşımaz; boş kapsam kapalıdır', async () => {
  const filter = { q: WORDS, company: WORDS, title: WORDS, city: WORDS };
  const result = await matchingDirectoryText(db, filter, [universityId]);
  const foreignPosition = await db.position.findFirstOrThrow({
    where: { userId: foreign },
    select: { id: true },
  });
  const foreignProfile = await db.profile.findUniqueOrThrow({
    where: { userId: foreign },
    select: { id: true },
  });
  expect(result.users?.filter((id) => id === owner)).toHaveLength(1);
  const ownerPosition = await db.position.findFirstOrThrow({
    where: { userId: owner, companyRaw: WORDS },
    select: { id: true },
  });
  const ownerProfile = await db.profile.findUniqueOrThrow({
    where: { userId: owner },
    select: { id: true },
  });
  expect(result.positions?.filter((id) => id === ownerPosition.id)).toHaveLength(1);
  expect(result.profiles?.filter((id) => id === ownerProfile.id)).toHaveLength(1);
  expect(result.users).not.toContain(foreign);
  expect(result.positions).not.toContain(foreignPosition.id);
  expect(result.profiles).not.toContain(foreignProfile.id);
  expect(await matchingDirectoryText(db, filter, [])).toEqual({
    users: [],
    positions: [],
    profiles: [],
  });
});
it('eşleşme deposu onay bekleyen ve biten üyeliği kapsama almaz', async () => {
  // Aynı üniversite, aynı metin; yalnız üyelik durumu farklı. Servis ikinci katmanda süzdüğü için çıktı
  // değişmez, bu yüzden sözleşmeyi doğrudan depoda sabitliyoruz. Metin bu teste özgü: ortak WORDS verisine
  // (yönetim araması bekleyen üyeleri de listeler) sızıp başka testleri karışık sırada bozmasın.
  const text = unique('kapsam442').replace(/[^a-z0-9]/gi, '');
  const make = async (membership: { status?: 'PENDING'; endedAt?: Date }) => {
    const id = await createUser(db, { name: text });
    await addMembership(db, {
      userId: id,
      departmentId,
      role: 'ALUMNI',
      graduationYear: 2022,
      ...membership,
    });
    const profile = await db.profile.create({
      data: { userId: id, alumniDirectoryVisible: true, city: text },
      select: { id: true },
    });
    const position = await db.position.create({
      data: { userId: id, companyRaw: text, titleRaw: text, isCurrent: true, source: 'MANUAL' },
      select: { id: true },
    });
    return { id, profileId: profile.id, positionId: position.id };
  };
  const active = await make({});
  const pending = await make({ status: 'PENDING' });
  const ended = await make({ endedAt: new Date('2025-01-01T00:00:00Z') });
  const filter = { q: text, company: text, title: text, city: text };
  const result = await matchingDirectoryText(db, filter, [universityId]);
  // Karşı deneme: doğrulanmış ve süren üyelik aynı metinle kapsamda.
  expect(result.users).toEqual([active.id]);
  expect(result.positions).toEqual([active.positionId]);
  expect(result.profiles).toEqual([active.profileId]);
  for (const excluded of [pending, ended]) {
    expect(result.users).not.toContain(excluded.id);
    expect(result.positions).not.toContain(excluded.positionId);
    expect(result.profiles).not.toContain(excluded.profileId);
  }
});
it('şirket ve unvan iki ayrı güncel pozisyondan birleştirilmez', async () => {
  await db.position.createMany({
    data: [
      {
        userId: owner,
        companyRaw: 'Kesişim Kurumu',
        titleRaw: 'Başka Görev',
        isCurrent: true,
        source: 'MANUAL',
      },
      {
        userId: owner,
        companyRaw: 'Başka Kurum',
        titleRaw: 'Kesişim Görevi',
        isCurrent: true,
        source: 'MANUAL',
      },
    ],
  });
  const filter = { company: 'Kesişim Kurumu', title: 'Kesişim Görevi' };
  expect((await mentors(filter)).items).toEqual([]);
  expect((await alumni(filter)).items).toEqual([]);
});
