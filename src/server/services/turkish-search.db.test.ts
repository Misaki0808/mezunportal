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
} from '@/test/fixtures';
import { loadActor } from '../permissions/actor';
import { searchMentors } from './mentor-directory';
import { searchAlumni } from './alumni-directory';
import { searchUsers } from './admin-panel';
import { listCourseGuide } from './course-guide';
import { settleEvents } from './event';

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
let departmentId: string;
beforeAll(async () => {
  const inst = await createInstitution(db);
  departmentId = inst.deptA1;
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
  await db.position.create({
    data: { userId: owner, companyRaw: WORDS, titleRaw: WORDS, isCurrent: true, source: 'MANUAL' },
  });
  const foreign = await make((await createInstitution(db)).deptA1, WORDS);
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
