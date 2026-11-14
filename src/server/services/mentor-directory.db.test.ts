import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  MENTOR_PAGE_SIZE_DEFAULT,
  SIMILAR_MENTORS_MAX,
  mentorPageSchema,
  searchMentorsSchema,
  type SearchMentorsInput,
} from '@/contracts/mentor-directory';
import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser, type Institution } from '@/test/fixtures';

import { loadActor } from '../permissions/actor';
import {
  getMentorEntryPoints,
  getSimilarMentors,
  searchMentors,
  type MentorDirectoryDeps,
} from './mentor-directory';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

let inst: Institution;
let other: Institution;
beforeAll(async () => {
  inst = await createInstitution(db);
  other = await createInstitution(db);
});

const NOW = new Date('2030-06-15T12:00:00Z');
const tag = () => `zm${randomUUID().replace(/-/g, '').slice(0, 10)}`;
const DAY = 86_400_000;

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(isCodedError(error), `kodlu hata bekleniyordu (${code}); gelen: ${String(error)}`).toBe(
    true,
  );
  expect(isCodedError(error) && error.code).toBe(code);
}
const actorOf = async (userId: string) => {
  const actor = await loadActor(db, userId, NOW);
  if (!actor) throw new Error('aktör yok');
  return actor;
};
const deps = (extra: Partial<MentorDirectoryDeps> = {}): MentorDirectoryDeps => ({
  db,
  now: () => NOW,
  ...extra,
});
const search = async (
  viewer: string,
  filter: SearchMentorsInput = {},
  extra: Partial<MentorDirectoryDeps> = {},
) =>
  searchMentors(
    deps(extra),
    await actorOf(viewer),
    searchMentorsSchema.parse({ pageSize: 50, ...filter }),
  );
const ids = (page: { items: { userId: string }[] }) => page.items.map((item) => item.userId);

async function member(
  departmentId = inst.deptA1,
  role: 'STUDENT' | 'ALUMNI' | 'ACADEMIC' = 'STUDENT',
  options: { name?: string; status?: 'PENDING' | 'VERIFIED' } = {},
) {
  const userId = await createUser(db, { name: options.name ?? `Kişi ${tag()}` });
  await addMembership(db, {
    userId,
    departmentId,
    role,
    status: options.status ?? 'VERIFIED',
    ...(role === 'ALUMNI'
      ? { graduationYear: 2021 }
      : role === 'STUDENT'
        ? { entryYear: 2022 }
        : {}),
  });
  return userId;
}

type MentorOptions = {
  departmentId?: string;
  role?: 'STUDENT' | 'ALUMNI' | 'ACADEMIC';
  isActive?: boolean;
  monthlyCapacity?: number;
  pausedUntil?: Date | null;
  meetingModes?: ('ONLINE' | 'IN_PERSON')[];
  cvReviewEnabled?: boolean;
  cvReviewMonthlyLimit?: number;
  name?: string;
  headline?: string;
};
async function mentor(options: MentorOptions = {}) {
  const userId = await member(options.departmentId ?? inst.deptA1, options.role ?? 'ALUMNI', {
    ...(options.name ? { name: options.name } : {}),
  });
  await db.mentorProfile.create({
    data: {
      userId,
      isActive: options.isActive ?? true,
      monthlyCapacity: options.monthlyCapacity ?? 4,
      sessionMinutes: 30,
      meetingModes: options.meetingModes ?? ['ONLINE'],
      pausedUntil: options.pausedUntil ?? null,
      cvReviewEnabled: options.cvReviewEnabled ?? false,
      cvReviewMonthlyLimit: options.cvReviewMonthlyLimit ?? 0,
    },
  });
  if (options.headline)
    await db.profile.upsert({
      where: { userId },
      create: { userId, headline: options.headline },
      update: { headline: options.headline },
    });
  return userId;
}
const position = (
  userId: string,
  data: {
    companyRaw?: string;
    titleRaw?: string;
    isCurrent?: boolean;
    sectorId?: string | null;
    companyId?: string | null;
    startYear?: number;
    endYear?: number;
  } = {},
) =>
  db.position.create({
    data: {
      userId,
      companyRaw: data.companyRaw ?? `Şirket ${tag()}`,
      titleRaw: data.titleRaw ?? `Unvan ${tag()}`,
      isCurrent: data.isCurrent ?? true,
      sectorId: data.sectorId ?? null,
      companyId: data.companyId ?? null,
      startYear: data.startYear ?? null,
      endYear: data.endYear ?? null,
      source: 'MANUAL',
    },
  });
async function attachTags(
  userId: string,
  tags: { kind: 'INTEREST' | 'GOAL' | 'SKILL'; slug: string; label?: string }[],
) {
  const profile = await db.profile.upsert({ where: { userId }, create: { userId }, update: {} });
  for (const entry of tags) {
    const row = await db.tag.upsert({
      where: { kind_slug: { kind: entry.kind, slug: entry.slug } },
      create: {
        kind: entry.kind,
        slug: entry.slug,
        ...(entry.kind === 'SKILL' ? { label: entry.label ?? entry.slug, curated: true } : {}),
      },
      update: {},
    });
    await db.profileTag.create({ data: { profileId: profile.id, tagId: row.id } });
  }
}
const sector = (name = `Sektör ${tag()}`) =>
  db.sector.create({ data: { name, normalizedName: `${name.toLowerCase()}-${tag()}` } });
const experience = async (
  authorId: string,
  data: {
    type?: 'INTERNSHIP' | 'ERASMUS';
    isAnonymous?: boolean;
    status?: 'PUBLISHED' | 'PENDING' | 'DRAFT';
  } = {},
) => {
  const status = data.status ?? 'PUBLISHED';
  const type = data.type ?? 'INTERNSHIP';
  return db.experience.create({
    data: {
      authorId,
      departmentIdAtWrite: inst.deptA1,
      type,
      status,
      isAnonymous: data.isAnonymous ?? false,
      organizationName: `Kurum ${tag()}`,
      ...(status !== 'DRAFT'
        ? {
            termYear: 2026,
            termSeason: 'SUMMER' as const,
            durationWeeks: 8,
            pay: type === 'INTERNSHIP' ? ('PAID' as const) : null,
            applicationChannel: 'COMPANY_SITE' as const,
            country: type === 'ERASMUS' ? 'Almanya' : null,
            whatLearned: 'Çok şey',
            advice: 'Başvur',
          }
        : {}),
      ...(status === 'PUBLISHED'
        ? { publishedAt: NOW, moderatedAt: NOW, moderatedById: await moderatorId() }
        : {}),
    },
  });
};
let cachedModerator: string | null = null;
async function moderatorId() {
  cachedModerator ??= await createUser(db);
  return cachedModerator;
}

// =============================================================================================
describe('görünürlük', () => {
  it('yalnız görünür mentor listelenir: etkin profil, geçerli hesap, doğrulanmış etkin üyelik, aynı üniversite; kendisi hariç', async () => {
    const viewer = await member();
    const visible = await mentor();
    const inactive = await mentor({ isActive: false });
    const suspended = await mentor();
    await db.user.update({ where: { id: suspended }, data: { banned: true } });
    const timedBan = await mentor();
    await db.user.update({
      where: { id: timedBan },
      data: { banned: true, banExpires: new Date(NOW.getTime() + DAY) },
    });
    const expiredBan = await mentor();
    await db.user.update({
      where: { id: expiredBan },
      data: { banned: true, banExpires: new Date(NOW.getTime() - DAY) },
    });
    const deleted = await mentor();
    await db.user.update({ where: { id: deleted }, data: { deletedAt: NOW } });
    const unverified = await member(inst.deptA1, 'ALUMNI', { status: 'PENDING' });
    await db.mentorProfile.create({
      data: {
        userId: unverified,
        isActive: true,
        monthlyCapacity: 3,
        sessionMinutes: 20,
        meetingModes: ['ONLINE'],
      },
    });
    const closed = await mentor();
    await db.membership.updateMany({
      where: { userId: closed },
      data: { endedAt: new Date(NOW.getTime() - DAY) },
    });
    const foreign = await mentor({ departmentId: other.deptA1 });
    const noMembership = await createUser(db);
    await db.mentorProfile.create({
      data: {
        userId: noMembership,
        isActive: true,
        monthlyCapacity: 3,
        sessionMinutes: 20,
        meetingModes: ['ONLINE'],
      },
    });
    const selfMentor = await mentor();

    const everyone = await search(viewer);
    // Toplam, görünür mentor sayısıdır (doğrulanmamış üyelik kartı düşse bile toplamı şişirmemeli).
    expect(everyone.total).toBe(everyone.items.length);
    const list = ids(everyone);
    expect(list).toEqual(expect.arrayContaining([visible, expiredBan]));
    for (const hidden of [
      inactive,
      suspended,
      timedBan,
      deleted,
      unverified,
      closed,
      foreign,
      noMembership,
    ]) {
      expect(list, `görünmemeli: ${hidden}`).not.toContain(hidden);
    }
    // Mentor kendi dizininde kendini görmez.
    expect(ids(await search(selfMentor))).not.toContain(selfMentor);
    // Aynı üniversitedeki başka fakülte/bölüm mentoru görünür; başka üniversitedeki izleyici bizimkini görmez.
    const sibling = await mentor({ departmentId: inst.deptB1 });
    expect(ids(await search(viewer))).toContain(sibling);
    const foreignViewer = await member(other.deptA1);
    const foreignList = ids(await search(foreignViewer));
    expect(foreignList).toContain(foreign);
    expect(foreignList).not.toContain(visible);
  });

  it('doğrulanmamış, askıdaki ya da üyeliksiz izleyici dizini kullanamaz', async () => {
    const unverified = await member(inst.deptA1, 'STUDENT', { status: 'PENDING' });
    await expectCode(search(unverified), 'AUTH_NOT_VERIFIED');
    const orphan = await createUser(db);
    await expectCode(search(orphan), 'AUTH_NOT_VERIFIED');
    const suspended = await member();
    await db.user.update({ where: { id: suspended }, data: { banned: true } });
    await expectCode(
      searchMentors(
        deps(),
        {
          userId: suspended,
          facts: { accountStatus: 'SUSPENDED', memberships: [], grants: [], mentor: null },
        } as never,
        searchMentorsSchema.parse({}),
      ),
      'AUTH_ACCOUNT_SUSPENDED',
    );
  });

  it('istemci süzgeci görünürlüğü genişletemez (bilinmeyen alan şemada reddedilir)', () => {
    expect(searchMentorsSchema.safeParse({ universityId: 'x' }).success).toBe(false);
    expect(searchMentorsSchema.safeParse({ includeSuspended: true }).success).toBe(false);
  });
});

// =============================================================================================
describe('süzgeçler', () => {
  it('mentor türü', async () => {
    const viewer = await member();
    const alumni = await mentor({ role: 'ALUMNI' });
    const academic = await mentor({ role: 'ACADEMIC' });
    const student = await mentor({ role: 'STUDENT' });
    const only = (page: { userId: string }[]) =>
      [alumni, academic, student].filter((id) => page.some((p) => p.userId === id));
    expect(only((await search(viewer, { mentorTypes: ['ALUMNI'] })).items)).toEqual([alumni]);
    expect(
      only((await search(viewer, { mentorTypes: ['ACADEMIC', 'STUDENT'] })).items).sort(),
    ).toEqual([academic, student].sort());
    const cards = (await search(viewer, {})).items;
    expect(cards.find((c) => c.userId === student)?.mentorType).toBe('STUDENT');
  });

  it('görüşme biçimi: istenenlerden herhangi birini sunan', async () => {
    const viewer = await member();
    const online = await mentor({ meetingModes: ['ONLINE'] });
    const inPerson = await mentor({ meetingModes: ['IN_PERSON'] });
    const both = await mentor({ meetingModes: ['ONLINE', 'IN_PERSON'] });
    const inPersonList = ids(await search(viewer, { meetingModes: ['IN_PERSON'] }));
    expect(inPersonList).toEqual(expect.arrayContaining([inPerson, both]));
    expect(inPersonList).not.toContain(online);
    const either = ids(await search(viewer, { meetingModes: ['ONLINE', 'IN_PERSON'] }));
    expect(either).toEqual(expect.arrayContaining([online, inPerson, both]));
  });

  it('sektör: pozisyonun kendi sektörü ya da şirketinin sektörü; başka sektör çıkmaz', async () => {
    const viewer = await member();
    const [fin, health] = [await sector(), await sector()];
    const bank = await db.company.create({
      data: { name: 'Banka', normalizedName: `banka-${tag()}`, sectorId: fin.id, aliases: [] },
    });
    const viaPosition = await mentor();
    await position(viaPosition, { sectorId: fin.id });
    const viaCompany = await mentor();
    await position(viaCompany, { companyId: bank.id });
    const other1 = await mentor();
    await position(other1, { sectorId: health.id });
    const none = await mentor();
    const list = ids(await search(viewer, { sectorId: fin.id }));
    expect(list.sort()).toEqual([viaPosition, viaCompany].sort());
    expect(list).not.toContain(other1);
    expect(list).not.toContain(none);
    expect(ids(await search(viewer, { sectorId: randomUUID() }))).toEqual([]);
  });

  it('şirket ve unvan: kısmi, büyük/küçük harf duyarsız; sözlük adı ya da ham metin; özel karakterler joker değil', async () => {
    const viewer = await member();
    const t = tag();
    const dictCompany = await db.company.create({
      data: { name: `Sözlük Holding ${t}`, normalizedName: `sozluk holding ${t}`, aliases: [] },
    });
    const dictTitle = await db.title.create({
      data: { name: `Veri Bilimci ${t}`, normalizedName: `veri bilimci ${t}`, aliases: [] },
    });
    const byRaw = await mentor();
    await position(byRaw, { companyRaw: `Acme ${t} Teknoloji`, titleRaw: `Kıdemli Analist ${t}` });
    const byDict = await mentor();
    await position(byDict, {
      companyRaw: 'Farklı Yazım',
      titleRaw: 'Farklı Unvan',
      companyId: dictCompany.id,
    });
    await db.position.updateMany({ where: { userId: byDict }, data: { titleId: dictTitle.id } });
    const percent = await mentor();
    await position(percent, { companyRaw: `100% Şirket ${t}` });
    const unrelated = await mentor();
    await position(unrelated, { companyRaw: 'Hiç Alakasız', titleRaw: 'Başka' });

    expect(ids(await search(viewer, { company: `ACME ${t.toUpperCase()}` }))).toEqual([byRaw]);
    expect(ids(await search(viewer, { company: `sözlük holding ${t}` }))).toEqual([byDict]);
    expect(ids(await search(viewer, { company: `sozluk holding ${t}` }))).toEqual([byDict]);
    expect(ids(await search(viewer, { title: `kıdemli analist ${t}` }))).toEqual([byRaw]);
    expect(ids(await search(viewer, { title: `veri bilimci ${t}` }))).toEqual([byDict]);
    expect(ids(await search(viewer, { company: `100% Şirket ${t}` }))).toEqual([percent]);
    expect(ids(await search(viewer, { company: '%%' }))).toEqual([]);
    expect(ids(await search(viewer, { company: '__' }))).toEqual([]);
  });

  it('deneyim türü yalnız yayınlanmış ADLI deneyimlere bakar; anonim, bekleyen ve taslak mentoru ele vermez', async () => {
    const viewer = await member();
    const named = await mentor();
    await experience(named, { type: 'INTERNSHIP' });
    const anonymous = await mentor();
    await experience(anonymous, { type: 'INTERNSHIP', isAnonymous: true });
    const pending = await mentor();
    await experience(pending, { type: 'INTERNSHIP', status: 'PENDING' });
    const draft = await mentor();
    await experience(draft, { type: 'INTERNSHIP', status: 'DRAFT' });
    const erasmus = await mentor();
    await experience(erasmus, { type: 'ERASMUS' });

    const internship = ids(await search(viewer, { experienceTypes: ['INTERNSHIP'] }));
    expect(internship).toContain(named);
    for (const hidden of [anonymous, pending, draft, erasmus])
      expect(internship).not.toContain(hidden);
    const both = ids(await search(viewer, { experienceTypes: ['INTERNSHIP', 'ERASMUS'] }));
    expect(both).toEqual(expect.arrayContaining([named, erasmus]));
    expect(both).not.toContain(anonymous);
  });

  it('süzgeç kombinasyonları birlikte daraltır (VE)', async () => {
    const viewer = await member();
    const s = await sector();
    const t = tag();
    const match = await mentor({ role: 'ALUMNI', meetingModes: ['IN_PERSON'] });
    await position(match, { sectorId: s.id, companyRaw: `Kombine ${t}`, titleRaw: 'Analist' });
    await experience(match, { type: 'INTERNSHIP' });
    const wrongRole = await mentor({ role: 'ACADEMIC', meetingModes: ['IN_PERSON'] });
    await position(wrongRole, { sectorId: s.id, companyRaw: `Kombine ${t}`, titleRaw: 'Analist' });
    await experience(wrongRole, { type: 'INTERNSHIP' });
    const wrongMode = await mentor({ role: 'ALUMNI', meetingModes: ['ONLINE'] });
    await position(wrongMode, { sectorId: s.id, companyRaw: `Kombine ${t}`, titleRaw: 'Analist' });
    await experience(wrongMode, { type: 'INTERNSHIP' });
    const noExperience = await mentor({ role: 'ALUMNI', meetingModes: ['IN_PERSON'] });
    await position(noExperience, {
      sectorId: s.id,
      companyRaw: `Kombine ${t}`,
      titleRaw: 'Analist',
    });
    // Şirket bir pozisyonda, sektör başka pozisyonda olsa da mentorun yolu bütünüyle aranır.
    const split = await mentor({ role: 'ALUMNI', meetingModes: ['IN_PERSON'] });
    await position(split, {
      companyRaw: `Kombine ${t}`,
      titleRaw: 'Analist',
      isCurrent: false,
      endYear: 2020,
    });
    await position(split, { sectorId: s.id });
    await experience(split, { type: 'INTERNSHIP' });

    const result = ids(
      await search(viewer, {
        mentorTypes: ['ALUMNI'],
        sectorId: s.id,
        company: `kombine ${t}`,
        title: 'analist',
        experienceTypes: ['INTERNSHIP'],
        meetingModes: ['IN_PERSON'],
      }),
    );
    expect(result.sort()).toEqual([match, split].sort());
  });
});

// =============================================================================================
describe('müsaitlik', () => {
  it('“müsait değilim” modundaki mentor yalnız-müsait listesinde çıkmaz; süresi dolan çıkar; genel listede kalır', async () => {
    const viewer = await member();
    const free = await mentor();
    const paused = await mentor({ pausedUntil: new Date(NOW.getTime() + DAY) });
    const expired = await mentor({ pausedUntil: new Date(NOW.getTime() - DAY) });
    const all = await search(viewer);
    expect(ids(all)).toEqual(expect.arrayContaining([free, paused, expired]));
    const pausedCard = all.items.find((card) => card.userId === paused)!;
    expect(pausedCard.availability).toEqual({
      available: false,
      reason: 'PAUSED',
      pausedUntil: new Date(NOW.getTime() + DAY),
    });
    expect(all.items.find((card) => card.userId === expired)!.availability.available).toBe(true);
    const available = ids(await search(viewer, { onlyAvailable: true }));
    expect(available).toEqual(expect.arrayContaining([free, expired]));
    expect(available).not.toContain(paused);
  });

  it('kapasitesi dolan mentor yalnız-müsait listesinde çıkmaz; doluluk kartta görünür', async () => {
    const viewer = await member();
    const roomy = await mentor({ monthlyCapacity: 4 });
    const full = await mentor({ monthlyCapacity: 2 });
    const zero = await mentor({ monthlyCapacity: 0 });
    const approvedCounts = async () =>
      new Map([
        [full, 2],
        [roomy, 1],
        [zero, 0],
      ]);
    const page = await search(viewer, { onlyAvailable: true }, { approvedCounts });
    expect(ids(page)).toContain(roomy);
    expect(ids(page)).not.toContain(full);
    expect(ids(page)).not.toContain(zero);
    const all = await search(viewer, {}, { approvedCounts });
    expect(all.items.find((c) => c.userId === full)).toMatchObject({
      availability: { available: false, reason: 'CAPACITY_FULL', pausedUntil: null },
      capacity: { monthly: 2, used: 2, remaining: 0 },
    });
    expect(all.items.find((c) => c.userId === roomy)).toMatchObject({
      availability: { available: true, reason: null },
      capacity: { monthly: 4, used: 1, remaining: 3 },
    });
  });

  it('yalnız-müsait ile toplam ve sayfalama kapasite süzgecinden SONRA hesaplanır', async () => {
    const scope = await createInstitution(db);
    const viewer = await member(scope.deptA1);
    const mentors: string[] = [];
    for (let index = 0; index < 5; index += 1)
      mentors.push(await mentor({ departmentId: scope.deptA1 }));
    const fullOnes = new Set([mentors[0]!, mentors[2]!]);
    const approvedCounts = async (_db: unknown, list: readonly string[]) =>
      new Map(list.map((id) => [id, fullOnes.has(id) ? 4 : 0]));
    const first = await search(viewer, { onlyAvailable: true, pageSize: 2 }, { approvedCounts });
    expect(first).toMatchObject({ total: 3, hasMore: true, page: 1 });
    const second = await search(
      viewer,
      { onlyAvailable: true, pageSize: 2, page: 2 },
      { approvedCounts },
    );
    expect(second).toMatchObject({ total: 3, hasMore: false, page: 2 });
    const seen = [...ids(first), ...ids(second)];
    expect(new Set(seen).size).toBe(3);
    for (const id of seen) expect(fullOnes.has(id)).toBe(false);
    expect(
      (await search(viewer, { onlyAvailable: true, pageSize: 2, page: 3 }, { approvedCounts }))
        .items,
    ).toEqual([]);
  });
});

// =============================================================================================
describe('mentor kartı', () => {
  it('başlık, güncel pozisyon, sektör, konular, beceriler ve görüşme bilgisi; e-posta/telefon yok', async () => {
    const viewer = await member();
    const s = await sector('Finans');
    const userId = await mentor({
      headline: 'Veri odaklı analist',
      name: 'Ayşe Mentor',
      role: 'ALUMNI',
    });
    await db.user.update({ where: { id: userId }, data: { phone: '05321234567' } });
    await position(userId, {
      companyRaw: 'Eski Şirket',
      titleRaw: 'Stajyer',
      isCurrent: false,
      endYear: 2020,
      startYear: 2019,
    });
    await position(userId, {
      companyRaw: 'Şimdiki Şirket',
      titleRaw: 'Analist',
      isCurrent: true,
      startYear: 2021,
      sectorId: s.id,
    });
    await attachTags(userId, [
      { kind: 'INTEREST', slug: 'data' },
      { kind: 'INTEREST', slug: 'erp' },
      { kind: 'GOAL', slug: 'career' },
      ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l) => ({
        kind: 'SKILL' as const,
        slug: `beceri-${l.toLowerCase()}-${userId.slice(0, 6)}`,
        label: `Beceri ${l}`,
      })),
    ]);
    const card = (await search(viewer)).items.find((item) => item.userId === userId)!;
    expect(card).toMatchObject({
      displayName: 'Ayşe Mentor',
      headline: 'Veri odaklı analist',
      mentorType: 'ALUMNI',
      departmentName: 'Bölüm A1',
      graduationYear: 2021,
      position: { company: 'Şimdiki Şirket', title: 'Analist' },
      sectorName: 'Finans',
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
      cvReviewEnabled: false,
    });
    expect(card.topics.sort()).toEqual(['data', 'erp']);
    expect(card.skills).toHaveLength(5);
    expect(card.skills[0]).toBe('Beceri A');
    const text = JSON.stringify(card);
    expect(text).not.toContain('05321234567');
    expect(text).not.toContain('@');
    expect(text).not.toContain('goal'); // hedef etiketi kartta yok
    expect(() =>
      mentorPageSchema.parse({ items: [card], page: 1, pageSize: 1, total: 1, hasMore: false }),
    ).not.toThrow();
  });

  it('birden çok üyelikte tür önceliği akademisyen > mezun > öğrenci; kapanmış/başka üniversite üyeliği kartı etkilemez', async () => {
    const viewer = await member();
    const userId = await mentor({ role: 'ALUMNI' });
    await addMembership(db, { userId, departmentId: inst.deptA2, role: 'ACADEMIC' });
    await addMembership(db, { userId, departmentId: other.deptA1, role: 'ACADEMIC' });
    const card = (await search(viewer)).items.find((item) => item.userId === userId)!;
    expect(card.mentorType).toBe('ACADEMIC');
    expect(card.departmentName).toBe('Bölüm A2');
    expect(ids(await search(viewer, { mentorTypes: ['ALUMNI'] }))).toContain(userId);
  });

  it('pozisyonu ve profili olmayan mentor da geçerli kart verir', async () => {
    const viewer = await member();
    const userId = await mentor();
    const card = (await search(viewer)).items.find((item) => item.userId === userId)!;
    expect(card).toMatchObject({
      headline: null,
      position: null,
      sectorName: null,
      topics: [],
      skills: [],
    });
  });

  it('varsayılan sayfa boyutu ve sayfalama alanları', async () => {
    const viewer = await member();
    await mentor();
    const page = await searchMentors(deps(), await actorOf(viewer), searchMentorsSchema.parse({}));
    expect(page.pageSize).toBe(MENTOR_PAGE_SIZE_DEFAULT);
    expect(page.items.length).toBeLessThanOrEqual(MENTOR_PAGE_SIZE_DEFAULT);
  });
});

// =============================================================================================
describe('getMentorEntryPoints', () => {
  const run = async (viewer: string, userId: string, extra: Partial<MentorDirectoryDeps> = {}) =>
    getMentorEntryPoints(deps(extra), await actorOf(viewer), { userId });

  it('müsait mentor: üç giriş açık (CV incelemesi mentor açtıysa)', async () => {
    const viewer = await member();
    const target = await mentor({ cvReviewEnabled: true, cvReviewMonthlyLimit: 2 });
    expect(await run(viewer, target)).toEqual({
      appointment: { available: true, reason: null },
      cvReview: { available: true, reason: null },
      contact: { available: true, reason: null },
      availability: { available: true, reason: null, pausedUntil: null },
    });
  });

  it('profil müsaitliği dizin kartıyla birebir aynıdır: müsait, ara verdi, ara bitti ve kapasite doldu', async () => {
    const viewer = await member();
    const targets = [
      await mentor(),
      await mentor({ pausedUntil: new Date(NOW.getTime() + DAY) }),
      await mentor({ pausedUntil: new Date(NOW.getTime() - DAY) }),
      await mentor({ monthlyCapacity: 0 }),
    ];
    const company = `Müsaitlik ${tag()}`;
    for (const target of targets) await position(target, { companyRaw: company });
    const directory = await search(viewer, { company });
    for (const target of targets) {
      const card = directory.items.find((item) => item.userId === target);
      expect(card).toBeDefined();
      const entry = await run(viewer, target);
      expect(entry).toHaveProperty('availability');
      expect(entry.availability).toEqual(card!.availability);
      expect(entry.appointment).toEqual({
        available: card!.availability.available,
        reason: card!.availability.reason,
      });
    }
  });

  it('sebepler: duraklatılmış, kapasite dolu, CV incelemesi kapalı ya da limit 0', async () => {
    const viewer = await member();
    const paused = await mentor({ pausedUntil: new Date(NOW.getTime() + DAY) });
    expect(await run(viewer, paused)).toMatchObject({
      appointment: { available: false, reason: 'PAUSED' },
      cvReview: { available: false, reason: 'CV_REVIEW_DISABLED' },
      contact: { available: true },
    });
    const full = await mentor({
      monthlyCapacity: 1,
      cvReviewEnabled: true,
      cvReviewMonthlyLimit: 0,
    });
    const result = await run(viewer, full, { approvedCounts: async () => new Map([[full, 1]]) });
    expect(result.appointment).toEqual({ available: false, reason: 'CAPACITY_FULL' });
    expect(result.cvReview).toEqual({ available: false, reason: 'CV_REVIEW_DISABLED' });
  });

  it('kendi profili: üç bayrak SELF', async () => {
    const selfMentor = await mentor();
    const blocked = { available: false, reason: 'SELF' };
    expect(await run(selfMentor, selfMentor)).toEqual({
      appointment: blocked,
      cvReview: blocked,
      contact: blocked,
    });
  });

  it('mentor olmayan görünür üye: randevu ve CV NOT_MENTOR, iletişim açık', async () => {
    const viewer = await member();
    const plain = await member();
    const inactive = await mentor({ isActive: false });
    for (const target of [plain, inactive]) {
      expect(await run(viewer, target)).toEqual({
        appointment: { available: false, reason: 'NOT_MENTOR' },
        cvReview: { available: false, reason: 'NOT_MENTOR' },
        contact: { available: true, reason: null },
      });
    }
  });

  it('görünmeyen hedef (başka üniversite, askıda, silinmiş, olmayan) hepsi NOT_MENTOR ve ayırt edilemez', async () => {
    const viewer = await member();
    const foreign = await mentor({ departmentId: other.deptA1 });
    const suspended = await mentor();
    await db.user.update({ where: { id: suspended }, data: { banned: true } });
    const deleted = await mentor();
    await db.user.update({ where: { id: deleted }, data: { deletedAt: NOW } });
    const blocked = { available: false, reason: 'NOT_MENTOR' };
    const expected = { appointment: blocked, cvReview: blocked, contact: blocked };
    for (const target of [foreign, suspended, deleted, randomUUID()]) {
      expect(await run(viewer, target), target).toEqual(expected);
    }
  });

  it('geçersiz girdi ve yetkisiz izleyici', async () => {
    const viewer = await member();
    await expectCode(
      getMentorEntryPoints(deps(), await actorOf(viewer), { userId: '' }),
      'VALIDATION_INVALID',
    );
    await expectCode(
      getMentorEntryPoints(deps(), await actorOf(viewer), { userId: 'x', role: 'SYSTEM' }),
      'VALIDATION_INVALID',
    );
    const unverified = await member(inst.deptA1, 'STUDENT', { status: 'PENDING' });
    await expectCode(run(unverified, viewer), 'AUTH_NOT_VERIFIED');
  });
});

// =============================================================================================
describe('getSimilarMentors', () => {
  async function scene() {
    const scope = await createInstitution(db);
    const s = await sector(`Fin ${tag()}`);
    const viewer = await member(scope.deptA1);
    await position(viewer, { sectorId: s.id });
    await attachTags(viewer, [
      { kind: 'INTEREST', slug: 'data' },
      { kind: 'INTEREST', slug: 'software' },
      { kind: 'GOAL', slug: 'internship' },
      { kind: 'SKILL', slug: `sql-${scope.deptA1.slice(0, 6)}`, label: 'SQL' },
    ]);
    return { scope, s, viewer, skillSlug: `sql-${scope.deptA1.slice(0, 6)}` };
  }
  const similar = async (viewer: string, extra: Partial<MentorDirectoryDeps> = {}) =>
    getSimilarMentors(deps(extra), await actorOf(viewer));

  it('örtüşmeye göre sıralar, gerekçe etiketleriyle; en fazla 5', async () => {
    const { scope, s, viewer, skillSlug } = await scene();
    const strong = await mentor({ departmentId: scope.deptA1 });
    await position(strong, { sectorId: s.id });
    await attachTags(strong, [
      { kind: 'INTEREST', slug: 'data' },
      { kind: 'SKILL', slug: skillSlug, label: 'SQL' },
      { kind: 'GOAL', slug: 'internship' },
    ]);
    const medium = await mentor({ departmentId: scope.deptA1 });
    await attachTags(medium, [{ kind: 'INTEREST', slug: 'software' }]);
    const weak = await mentor({ departmentId: scope.deptA1 });
    await attachTags(weak, [{ kind: 'GOAL', slug: 'internship' }]); // yalnız hedef + bölüm: öneri değil
    const unrelated = await mentor({ departmentId: scope.deptA1 });
    await attachTags(unrelated, [{ kind: 'INTEREST', slug: 'marketing' }]);

    const result = await similar(viewer);
    expect(result.items.map((entry) => entry.mentor.userId)).toEqual([strong, medium]);
    expect(result.items[0]!.reasons.map((reason) => reason.code)).toEqual([
      'SAME_SECTOR',
      'SHARED_INTEREST',
      'SHARED_SKILL',
      'SHARED_GOAL',
      'SAME_DEPARTMENT',
    ]);
    expect(result.items[0]!.reasons[0]).toEqual({ code: 'SAME_SECTOR', values: [s.name] });
    expect(result.items[1]!.reasons.map((reason) => reason.code)).toEqual([
      'SHARED_INTEREST',
      'SAME_DEPARTMENT',
    ]);

    for (let index = 0; index < 8; index += 1) {
      const extra = await mentor({ departmentId: scope.deptA1 });
      await attachTags(extra, [{ kind: 'INTEREST', slug: 'data' }]);
    }
    expect((await similar(viewer)).items).toHaveLength(SIMILAR_MENTORS_MAX);
  });

  it('yalnız müsait mentor önerilir; kendisi, askıdaki ve başka üniversite hariç', async () => {
    const { scope, viewer } = await scene();
    const make = async (options: MentorOptions = {}) => {
      const id = await mentor({ departmentId: scope.deptA1, ...options });
      await attachTags(id, [{ kind: 'INTEREST', slug: 'data' }]);
      return id;
    };
    const ok = await make();
    const paused = await make({ pausedUntil: new Date(NOW.getTime() + DAY) });
    const full = await make({ monthlyCapacity: 1 });
    const suspended = await make();
    await db.user.update({ where: { id: suspended }, data: { banned: true } });
    const inactive = await make({ isActive: false });
    const foreign = await mentor({ departmentId: other.deptA1 });
    await attachTags(foreign, [{ kind: 'INTEREST', slug: 'data' }]);
    const result = await similar(viewer, { approvedCounts: async () => new Map([[full, 1]]) });
    expect(result.items.map((entry) => entry.mentor.userId)).toEqual([ok]);
    for (const hidden of [paused, full, suspended, inactive, foreign]) {
      expect(JSON.stringify(result)).not.toContain(hidden);
    }
    // Mentor kendi önerisinde kendini görmez.
    const selfMentor = await make();
    expect((await similar(selfMentor)).items.map((e) => e.mentor.userId)).not.toContain(selfMentor);
  });

  it('gerekçede yalnız ortak öğeler görünür; adayın başka etiketi/becerisi sızmaz', async () => {
    const { scope, viewer, skillSlug } = await scene();
    const candidate = await mentor({ departmentId: scope.deptA1 });
    await attachTags(candidate, [
      { kind: 'INTEREST', slug: 'data' },
      { kind: 'INTEREST', slug: 'cybersecurity' },
      { kind: 'SKILL', slug: skillSlug, label: 'SQL' },
      { kind: 'SKILL', slug: `gizli-${tag()}`, label: 'GizliBeceri' },
    ]);
    const reasons = (await similar(viewer)).items[0]!.reasons;
    const text = JSON.stringify(reasons);
    expect(text).not.toContain('cybersecurity');
    expect(text).not.toContain('GizliBeceri');
    expect(reasons.find((r) => r.code === 'SHARED_INTEREST')?.values).toEqual(['data']);
    expect(reasons.find((r) => r.code === 'SHARED_SKILL')?.values).toEqual(['SQL']);
  });

  it('işareti olmayan izleyiciye öneri yok; doğrulanmamış izleyici kullanamaz', async () => {
    const empty = await member();
    expect((await similar(empty)).items).toEqual([]);
    const unverified = await member(inst.deptA1, 'STUDENT', { status: 'PENDING' });
    await expectCode(similar(unverified), 'AUTH_NOT_VERIFIED');
  });
});

it('deneyim türü yalnız arayanın üniversitesindeki yayından sinyal alır', async () => {
  const viewer = await member(inst.deptA1);
  const person = await mentor({ departmentId: inst.deptA2 });
  await addMembership(db, {
    userId: person,
    departmentId: other.deptA1,
    role: 'ALUMNI',
    graduationYear: 2021,
  });
  const row = await db.experience.create({
    data: {
      authorId: person,
      departmentIdAtWrite: other.deptA1,
      type: 'ERASMUS',
      status: 'PUBLISHED',
      publishedAt: NOW,
      moderatedAt: NOW,
      moderatedById: viewer,
      organizationName: 'Sentetik kurum',
      termYear: 2026,
      termSeason: 'SUMMER',
      durationWeeks: 8,
      applicationChannel: 'COMPANY_SITE',
      country: 'Almanya',
      whatLearned: 'Öğrendim',
      advice: 'Başvur',
      isAnonymous: false,
    },
  });
  expect(ids(await search(viewer, { experienceTypes: ['ERASMUS'] }))).not.toContain(person);
  await db.experience.create({
    data: {
      authorId: person,
      departmentIdAtWrite: inst.deptA2,
      type: 'ERASMUS',
      status: 'PUBLISHED',
      publishedAt: NOW,
      moderatedAt: NOW,
      moderatedById: viewer,
      organizationName: 'Sentetik kurum',
      termYear: 2026,
      termSeason: 'SUMMER',
      durationWeeks: 8,
      applicationChannel: 'COMPANY_SITE',
      country: 'Almanya',
      whatLearned: 'Öğrendim',
      advice: 'Başvur',
      isAnonymous: false,
    },
  });
  expect(ids(await search(viewer, { experienceTypes: ['ERASMUS'] }))).toContain(person);
  expect(row.departmentIdAtWrite).toBe(other.deptA1);
});
