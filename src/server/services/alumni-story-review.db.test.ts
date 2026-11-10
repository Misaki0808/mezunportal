import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
  neutralizeUserNames,
} from '@/test/fixtures';
import {
  getCurrentStory,
  getPublishedStory,
  listPublishedStories,
  saveStory,
  setStoryConsent,
  submitStory,
  reviewStory,
  selectMonthlyAlumnus,
  rotateMonthlyAlumni,
} from './alumni-story';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
// Kimlik denetimi tüm kullanıcı adlarına karşı sınar: önceki dosyaların bıraktığı adlar metinle çakışmasın (dalgalı hata, kart 170).
// Dosya başına bir kez (her testte tüm kullanıcıları güncellemek büyük veritabanında yavaştır; dosyalar sırayla koşar).
beforeAll(() => neutralizeUserNames(db));
const at = new Date('2026-05-15T10:00:00Z'),
  deps = { db, now: () => at };
const BODY =
  'Kariyer yolculuğumda öğrenmeye devam ettim. Ekip çalışmasını ve deneyim kazanmayı önemseyerek mesleki gelişimime katkı sağladım.';
async function fixture() {
  const inst = await createInstitution(db),
    foreign = await createInstitution(db),
    owner = await createUser(db, { name: 'Alya Demir' }),
    owner2 = await createUser(db, { name: 'Rüya Söğüt' }),
    viewer = await createUser(db),
    outsider = await createUser(db),
    abroad = await createUser(db),
    admin = await createUser(db);
  for (const id of [owner, owner2, viewer, outsider, abroad, admin])
    await grantRequiredConsents(db, id);
  for (const userId of [owner, owner2])
    await addMembership(db, { userId, role: 'ALUMNI', departmentId: inst.deptA1 });
  for (const [userId, departmentId] of [
    [viewer, inst.deptA1],
    [outsider, inst.deptA2],
    [abroad, foreign.deptA1],
  ] as const)
    await addMembership(db, { userId, departmentId, role: 'STUDENT', entryYear: 2024 });
  await addMembership(db, { userId: admin, role: 'ACADEMIC', departmentId: inst.deptA1 });
  await addGrant(db, { userId: admin, scope: 'SYSTEM' });
  return { inst, foreign, owner, owner2, viewer, outsider, abroad, admin };
}
async function publish(w: Awaited<ReturnType<typeof fixture>>, owner = w.owner) {
  const s = await saveStory(deps, owner, {
    departmentId: w.inst.deptA1,
    body: BODY,
    consent: true,
  });
  await submitStory(deps, owner, { storyId: s.id });
  await reviewStory(deps, w.admin, { storyId: s.id, decision: 'PUBLISH' });
  return s;
}
it('iki farklı hikâyenin aynı bölüm/ay yarışı tek seçimdir; rıza/sürüm/düzenleme bütün yansıtmaları kapatır', async () => {
  const w = await fixture(),
    stories = await Promise.all([publish(w), publish(w, w.owner2)]),
    choices = await Promise.allSettled(
      stories.map((s) =>
        selectMonthlyAlumnus(deps, w.admin, {
          departmentId: w.inst.deptA1,
          storyId: s.id,
          month: '2026-05',
          reason: 'Kariyer deneyimi',
        }),
      ),
    );
  expect(choices.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(choices.filter((x) => x.status === 'rejected')).toHaveLength(1);
  const chosen = await db.monthlyAlumnus.findUniqueOrThrow({
      where: { departmentId_month: { departmentId: w.inst.deptA1, month: '2026-05' } },
      include: { story: true },
    }),
    id = chosen.storyId,
    author = chosen.story.userId;
  expect(
    await db.adminAuditLog.count({
      where: { targetId: chosen.id, action: 'MONTHLY_ALUMNUS_SELECT' },
    }),
  ).toBe(1);
  for (const viewer of [w.outsider, w.abroad])
    await expect(getPublishedStory(deps, viewer, { storyId: id })).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  expect((await getCurrentStory(deps, w.viewer))?.id).toBe(id);
  async function hidden() {
    expect(await getCurrentStory(deps, w.viewer)).toBeNull();
    expect(await listPublishedStories(deps, w.viewer)).toEqual([]);
    await expect(getPublishedStory(deps, w.viewer, { storyId: id })).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  }
  await setStoryConsent(deps, author, { storyId: id, consent: false });
  await hidden();
  await setStoryConsent(deps, author, { storyId: id, consent: true });
  await db.alumniStory.update({ where: { id }, data: { publicConsentVersion: 'eski-1' } });
  await hidden();
  await setStoryConsent(deps, author, { storyId: id, consent: true });
  await saveStory(deps, author, {
    departmentId: w.inst.deptA1,
    body: BODY + ' Deneyimlerimi paylaşarak gelişmeye devam ettim.',
    consent: true,
  });
  await hidden();
  await submitStory(deps, author, { storyId: id });
  await hidden();
  await reviewStory(deps, w.admin, { storyId: id, decision: 'PUBLISH' });
  expect((await getCurrentStory(deps, w.viewer))?.id).toBe(id);
  await expect(
    setStoryConsent(deps, w.viewer, { storyId: id, consent: false }),
  ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
});
it('aynı ay farklı bölüm seçimi bağımsız, ay sınırı İstanbul ve iş tekrarında kayıt çoğalmaz', async () => {
  const w = await fixture();
  await addMembership(db, { userId: w.owner2, role: 'ALUMNI', departmentId: w.inst.deptA2 });
  const a = await publish(w),
    s = await saveStory(deps, w.owner2, { departmentId: w.inst.deptA2, body: BODY, consent: true });
  await submitStory(deps, w.owner2, { storyId: s.id });
  await reviewStory(deps, w.admin, { storyId: s.id, decision: 'PUBLISH' });
  await Promise.all(
    [
      [a, w.inst.deptA1],
      [s, w.inst.deptA2],
    ].map(([story, departmentId]) =>
      selectMonthlyAlumnus(deps, w.admin, {
        departmentId,
        storyId: (story as typeof a).id,
        month: '2026-05',
        reason: 'Bölüm katkısı',
      }),
    ),
  );
  expect((await getCurrentStory(deps, w.viewer))?.id).toBe(a.id);
  expect((await getCurrentStory(deps, w.outsider))?.id).toBe(s.id);
  const june = new Date('2026-05-31T21:00:00Z');
  expect((await getCurrentStory({ db, now: () => new Date(+june - 1) }, w.viewer))?.id).toBe(a.id);
  expect(await getCurrentStory({ db, now: () => june }, w.viewer)).toBeNull();
  await rotateMonthlyAlumni(db, june);
  await rotateMonthlyAlumni(db, june);
  expect(await db.monthlyAlumnus.count({ where: { storyId: { in: [a.id, s.id] } } })).toBe(2);
  expect(
    await db.monthlyAlumnus.count({ where: { storyId: { in: [a.id, s.id] }, active: true } }),
  ).toBe(0);
});
it('U+02BC/aksan/tam genişlik/ayrık ad ve iletişim biçimleri hem gönderimde hem yayın kararında engellenir', async () => {
  const w = await fixture();
  await createUser(db, { name: 'Nehir Akın' });
  for (const text of [
    'Néhirʼin görüşü',
    'Ｎｅｈｉｒ ile',
    'N e h i r ne dedi',
    'b i r i @ e x a m p l e . i n v a l i d',
    '0 5 3 2 1 2 3 4 5 6 7',
    '11111111110',
  ]) {
    const s = await saveStory(deps, w.owner, {
      departmentId: w.inst.deptA1,
      body: BODY + ' ' + text,
      consent: true,
    });
    await expect(submitStory(deps, w.owner, { storyId: s.id })).rejects.toMatchObject({
      code: 'STORY_IDENTITY_LEAK',
    });
    await db.alumniStory.update({
      where: { id: s.id },
      data: { status: 'PENDING', submittedAt: at },
    });
    await expect(
      reviewStory(deps, w.admin, { storyId: s.id, decision: 'PUBLISH' }),
    ).rejects.toMatchObject({ code: 'STORY_IDENTITY_LEAK' });
  }
});
it('yazarın tam kendi adı başka kullanıcının ilk adıyla aynı olsa da kendi anlatımı yayınlanabilir', async () => {
  const w = await fixture();
  await createUser(db, { name: 'Alya Ekin' });
  const s = await saveStory(deps, w.owner, {
    departmentId: w.inst.deptA1,
    body: 'Alya Demir olarak ' + BODY,
    consent: true,
  });
  await expect(submitStory(deps, w.owner, { storyId: s.id })).resolves.toMatchObject({
    status: 'PENDING',
  });
  await expect(
    reviewStory(deps, w.admin, { storyId: s.id, decision: 'PUBLISH' }),
  ).resolves.toMatchObject({ status: 'PUBLISHED' });
  for (const suffix of ['Alya Ekin ile görüştüm', 'alya.demir@example.invalid']) {
    await saveStory(deps, w.owner, {
      departmentId: w.inst.deptA1,
      body: 'Alya Demir olarak ' + BODY + ' ' + suffix,
      consent: true,
    });
    await expect(submitStory(deps, w.owner, { storyId: s.id })).rejects.toMatchObject({
      code: 'STORY_IDENTITY_LEAK',
    });
  }
});

it('paylaşılan veritabanında başka testten kalan ad, hikâye metnindeki sıradan sözcükle çakışırsa gönderim reddedilir; adlar nötrleşince geçer (dalgalı hatanın kök nedeni)', async () => {
  const w = await fixture();
  const draft = await saveStory(deps, w.owner, {
    departmentId: w.inst.deptA1,
    body: BODY + ' Yeni deneyimlerimi paylaşarak gelişmeye devam ettim.',
    consent: true,
  });
  // Başka bir test dosyasının bıraktığı kullanıcı (ör. "Yeni Üye 1"): metindeki "Yeni" sözcüğüyle eşleşir. Denetim gönderimde çalışır.
  await createUser(db, { name: 'Yeni Üye 1' });
  await expect(submitStory(deps, w.owner, { storyId: draft.id })).rejects.toMatchObject({
    code: 'STORY_IDENTITY_LEAK',
  });
  await neutralizeUserNames(db);
  await expect(submitStory(deps, w.owner, { storyId: draft.id })).resolves.toMatchObject({
    status: 'PENDING',
  });
});
