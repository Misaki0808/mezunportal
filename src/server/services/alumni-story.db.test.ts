import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { buildDataExport } from './dataExport';
import { deleteAccount } from './accountDeletion';
import {
  getCurrentStory,
  getPublishedStory,
  listPublishedStories,
  listStoryModeration,
  reviewStory,
  rotateMonthlyAlumni,
  saveStory,
  selectMonthlyAlumnus,
  setStoryConsent,
  submitStory,
} from './alumni-story';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
const BODY =
  'Üretim yolculuğum boyunca merakla öğrenmeye ve deneyim kazanmaya devam ettim. Zorluklar karşısında gelişmeyi seçtim.';

describe('Ayın mezunu', () => {
  it('rıza, moderasyon, bölüm kapsamı, tek seçim, ay devri ve silme koşullarını uygular', async () => {
    const inst = await createInstitution(db),
      another = await createInstitution(db);
    const author = await createUser(db, { name: 'Lal Tan' }),
      admin = await createUser(db, { name: 'Müdür Örnek' }),
      outsideAdmin = await createUser(db, { name: 'Farklı Yönetici' }),
      student = await createUser(db, { name: 'Öğrenci Bir' }),
      otherDept = await createUser(db, { name: 'Öğrenci İki' }),
      otherUni = await createUser(db, { name: 'Öğrenci Üç' });
    for (const user of [author, admin, outsideAdmin, student, otherDept, otherUni])
      await grantRequiredConsents(db, user);
    await addMembership(db, { userId: author, role: 'ALUMNI', departmentId: inst.deptA1 });
    await addMembership(db, { userId: admin, role: 'ACADEMIC', departmentId: inst.deptA1 });
    await addMembership(db, { userId: outsideAdmin, role: 'ACADEMIC', departmentId: inst.deptA2 });
    await addMembership(db, {
      userId: student,
      role: 'STUDENT',
      departmentId: inst.deptA1,
      entryYear: 2024,
    });
    await addMembership(db, {
      userId: otherDept,
      role: 'STUDENT',
      departmentId: inst.deptA2,
      entryYear: 2024,
    });
    await addMembership(db, {
      userId: otherUni,
      role: 'STUDENT',
      departmentId: another.deptA1,
      entryYear: 2024,
    });
    await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
    await addGrant(db, { userId: outsideAdmin, scope: 'DEPARTMENT', departmentId: inst.deptA2 });
    const at = new Date('2026-05-15T10:00:00Z'),
      deps = { db, now: () => at };
    let story = await saveStory(deps, author, {
      departmentId: inst.deptA1,
      body: BODY,
      consent: false,
    });
    await expect(submitStory(deps, author, { storyId: story.id })).rejects.toMatchObject({
      code: 'STORY_INVALID_STATE',
    });
    expect(await getCurrentStory(deps, student)).toBeNull();
    expect(
      (await listStoryModeration(deps, admin, { departmentId: inst.deptA1 })).some(
        (item) => item.id === story.id,
      ),
    ).toBe(false);
    story = await setStoryConsent(deps, author, { storyId: story.id, consent: true });
    story = await submitStory(deps, author, { storyId: story.id });
    expect(story.status).toBe('PENDING');
    await expect(
      reviewStory(deps, outsideAdmin, { storyId: story.id, decision: 'PUBLISH' }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await reviewStory(deps, admin, { storyId: story.id, decision: 'PUBLISH' });
    expect(await listPublishedStories(deps, student)).toEqual([]);
    const choices = await Promise.allSettled(
      [1, 2].map(() =>
        selectMonthlyAlumnus(deps, admin, {
          departmentId: inst.deptA1,
          storyId: story.id,
          month: '2026-05',
          reason: 'Topluluğa katkı',
        }),
      ),
    );
    expect(choices.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(choices.filter((x) => x.status === 'rejected')).toHaveLength(1);
    expect(await getCurrentStory(deps, student)).toMatchObject({
      id: story.id,
      month: '2026-05',
      body: BODY,
    });
    expect(await getCurrentStory(deps, otherDept)).toBeNull();
    expect(await getCurrentStory(deps, otherUni)).toBeNull();
    await addMembership(db, { userId: author, role: 'ALUMNI', departmentId: inst.deptA2 });
    await addMembership(db, {
      userId: student,
      role: 'STUDENT',
      departmentId: inst.deptA2,
      entryYear: 2024,
    });
    const oldMembership = await db.membership.findFirstOrThrow({
      where: { userId: author, departmentId: inst.deptA1, role: 'ALUMNI', endedAt: null },
      select: { id: true },
    });
    await db.membership.update({ where: { id: oldMembership.id }, data: { endedAt: at } });
    expect(await getCurrentStory(deps, student)).toBeNull();
    await db.membership.update({ where: { id: oldMembership.id }, data: { endedAt: null } });
    await expect(getPublishedStory(deps, otherDept, { storyId: story.id })).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    const flag = await db.suspicionFlag.create({
      data: {
        userId: author,
        rule: 'BURST',
        evidenceKey: `story-${author}`,
        entryIds: [],
        windowStart: at,
        windowEnd: at,
        entryCount: 0,
        points: 0,
      },
    });
    expect(await getCurrentStory(deps, student)).toBeNull();
    expect(
      (await listStoryModeration(deps, admin, { departmentId: inst.deptA1 })).some(
        (item) => item.id === story.id,
      ),
    ).toBe(false);
    await expect(
      selectMonthlyAlumnus(deps, admin, {
        departmentId: inst.deptA1,
        storyId: story.id,
        month: '2026-06',
        reason: 'Yeni dönem seçimi',
      }),
    ).rejects.toMatchObject({ code: 'STORY_INVALID_STATE' });
    await db.suspicionFlag.update({
      where: { id: flag.id },
      data: { status: 'CONFIRMED', decidedAt: at, decidedById: admin },
    });
    expect(await getCurrentStory(deps, student)).toBeNull();
    expect(
      (await listStoryModeration(deps, admin, { departmentId: inst.deptA1 })).some(
        (item) => item.id === story.id,
      ),
    ).toBe(false);
    await expect(
      selectMonthlyAlumnus(deps, admin, {
        departmentId: inst.deptA1,
        storyId: story.id,
        month: '2026-06',
        reason: 'Yeni dönem seçimi',
      }),
    ).rejects.toMatchObject({ code: 'STORY_INVALID_STATE' });
    await db.suspicionFlag.delete({ where: { id: flag.id } });
    const before = await getCurrentStory(
      { db, now: () => new Date('2026-05-31T20:59:59Z') },
      student,
    );
    expect(before?.id).toBe(story.id);
    const next = { db, now: () => new Date('2026-05-31T21:00:00Z') };
    expect(await getCurrentStory(next, student)).toBeNull();
    await selectMonthlyAlumnus(deps, admin, {
      departmentId: inst.deptA1,
      storyId: story.id,
      month: '2026-06',
      reason: 'Yeni dönem seçimi',
    });
    await rotateMonthlyAlumni(db, next.now());
    await rotateMonthlyAlumni(db, next.now());
    const selections = await db.monthlyAlumnus.findMany({
      where: { storyId: story.id },
      orderBy: { month: 'asc' },
    });
    expect(selections.map((x) => [x.month, x.active])).toEqual([
      ['2026-05', false],
      ['2026-06', true],
    ]);
    expect((await getCurrentStory(next, student))?.month).toBe('2026-06');
    await setStoryConsent(next, author, { storyId: story.id, consent: false });
    expect(await getCurrentStory(next, student)).toBeNull();
    expect(await listPublishedStories(next, student)).toEqual([]);
    await expect(getPublishedStory(next, student, { storyId: story.id })).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    await setStoryConsent(next, author, { storyId: story.id, consent: true });
    expect((await listPublishedStories(next, student)).length).toBe(2);
    const exported = await buildDataExport(db, author);
    expect(exported.alumniStories).toMatchObject([{ body: BODY }]);
    expect(exported.storyConsentDecisions.map((d) => d.granted)).toEqual([
      false,
      true,
      false,
      true,
    ]);
    await saveStory(next, author, {
      departmentId: inst.deptA1,
      body: `${BODY} Mesleğimde öğrenmeye devam ediyorum.`,
      consent: true,
    });
    expect(await listPublishedStories(next, student)).toEqual([]);
    await submitStory(next, author, { storyId: story.id });
    await reviewStory(next, admin, { storyId: story.id, decision: 'PUBLISH' });
    expect((await listPublishedStories(next, student)).length).toBe(2);
    const person = await db.user.findUniqueOrThrow({
      where: { id: author },
      select: { email: true },
    });
    await deleteAccount(
      db,
      author,
      { publishedContent: 'DELETE', confirmEmail: person.email },
      { removeStoredFiles: null },
    );
    expect(await db.alumniStory.count({ where: { userId: author } })).toBe(0);
    expect(await db.monthlyAlumnus.count({ where: { storyId: story.id } })).toBe(0);
    expect(await listPublishedStories(next, student)).toEqual([]);
    const history = await db.storyConsentDecision.findMany({ where: { userId: author } });
    expect(history).toHaveLength(4);
    expect(history.every((h) => h.storyId === null)).toBe(true);
    await expect(
      db.storyConsentDecision.update({ where: { id: history[0]!.id }, data: { granted: false } }),
    ).rejects.toThrow();
  });
  it('başka kişinin adı ve iletişim bilgisi moderasyona gönderilemez', async () => {
    const inst = await createInstitution(db),
      author = await createUser(db, { name: 'Pera Şen' }),
      other = await createUser(db, { name: 'İlknur Çakır' });
    await grantRequiredConsents(db, author);
    await addMembership(db, { userId: author, role: 'ALUMNI', departmentId: inst.deptA1 });
    await addMembership(db, {
      userId: other,
      role: 'STUDENT',
      departmentId: inst.deptA1,
      entryYear: 2023,
    });
    const deps = { db },
      body =
        'İlknur Çakır ile kariyer yolculuğumu anlattım; bu süreçte çok şey öğrendim ve devam ettim.';
    const story = await saveStory(deps, author, { departmentId: inst.deptA1, body, consent: true });
    await expect(submitStory(deps, author, { storyId: story.id })).rejects.toMatchObject({
      code: 'STORY_IDENTITY_LEAK',
    });
    await saveStory(deps, author, {
      departmentId: inst.deptA1,
      body: 'Kariyerim sırasında iletişim için biri@example.invalid adresini kullandım ve çok şey öğrendim.',
      consent: true,
    });
    await expect(submitStory(deps, author, { storyId: story.id })).rejects.toMatchObject({
      code: 'STORY_IDENTITY_LEAK',
    });
    expect(other).toBeTruthy();
  });
});
