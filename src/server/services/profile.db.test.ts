import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { dataExportSchema } from '@/contracts/privacy';
import { onboardingStateSchema } from '@/contracts/profile';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser, unique } from '@/test/fixtures';

import { deleteAccount } from './accountDeletion';
import { buildDataExport } from './dataExport';
import {
  getOnboardingState,
  listProfileTags,
  saveOnboardingStep,
  skipOnboardingStep,
} from './profile';

const db = createTestPrisma();
const NOW = new Date('2026-11-08T00:00:00Z');
let departmentId: string;
beforeAll(async () => {
  departmentId = (await createInstitution(db)).deptA1;
});
afterAll(() => db.$disconnect());

async function person(role: 'STUDENT' | 'ALUMNI' | 'ACADEMIC' = 'STUDENT', entryYear = 2025) {
  const userId = await createUser(db);
  await addMembership(db, {
    userId,
    departmentId,
    role,
    entryYear: role === 'ACADEMIC' ? null : entryYear,
    status: 'PENDING',
  });
  return userId;
}
async function tag(kind: 'INTEREST' | 'GOAL' | 'SKILL' = 'INTEREST') {
  return db.tag.create({ data: { kind, slug: unique('tag') } });
}
const status = (state: Awaited<ReturnType<typeof getOnboardingState>>, step: string) =>
  state.steps.find((item) => item.step === step)?.status;

it('rol+bölüm beyanı zorunludur: COMPLETE reddedilir, üyelik gelince ilk seçmeli adımdan sürer', async () => {
  const userId = await createUser(db);
  expect(await getOnboardingState(db, userId, NOW)).toMatchObject({
    step: 'MEMBERSHIP',
    completion: { percent: 0 },
  });
  await expect(saveOnboardingStep(db, userId, { step: 'COMPLETE' }, NOW)).rejects.toMatchObject({
    code: 'ONBOARDING_REQUIRED_STEP_PENDING',
  });
  await addMembership(db, {
    userId,
    departmentId,
    role: 'STUDENT',
    entryYear: 2025,
    status: 'PENDING',
  });
  const state = await getOnboardingState(db, userId, NOW);
  expect(state.step).toBe('INTERESTS');
  expect(status(state, 'MEMBERSHIP')).toBe('COMPLETED');
  expect(state.completion.percent).toBe(25);
  expect(await db.mentorProfile.count({ where: { userId } })).toBe(0);
});

it('yarıda kalan akış DB’den sürer; açık olmayan mentor adımı atlanır, yüzde ve eksikler doğrudur', async () => {
  const userId = await person();
  const interest = await tag();
  const goal = await tag('GOAL');
  const saved = await saveOnboardingStep(
    db,
    userId,
    { step: 'INTERESTS', tagIds: [interest.id] },
    NOW,
  );
  expect(saved.step).toBe('GOALS');
  const resumed = await getOnboardingState(db, userId, NOW);
  expect(resumed).toEqual(saved);
  expect(resumed.interestTagIds).toEqual([interest.id]);
  expect(resumed.completion).toEqual({ percent: 50, missing: ['GOALS', 'VISIBILITY'] });
  const goals = await saveOnboardingStep(db, userId, { step: 'GOALS', tagIds: [goal.id] }, NOW);
  expect(goals.step).toBe('VISIBILITY');
  expect(goals.steps.find((step) => step.step === 'MENTOR_PREFERENCE')).toMatchObject({
    applicable: false,
  });
  const done = await saveOnboardingStep(db, userId, { step: 'VISIBILITY', confirmed: true }, NOW);
  expect(done.completion).toEqual({ percent: 100, missing: [] });
  expect((await db.profile.findUniqueOrThrow({ where: { userId } })).completionScore).toBe(100);
  expect(onboardingStateSchema.safeParse(done).success).toBe(true);
});

it('atlama etiketleri korur, eksik sayar ve kalıcıdır; yeniden kaydetme COMPLETED yapar', async () => {
  const userId = await person();
  const interest = await tag();
  await saveOnboardingStep(db, userId, { step: 'INTERESTS', tagIds: [interest.id] }, NOW);
  const skipped = await skipOnboardingStep(db, userId, { step: 'INTERESTS' }, NOW);
  expect(skipped.interestTagIds).toEqual([interest.id]);
  expect(status(skipped, 'INTERESTS')).toBe('SKIPPED');
  expect(skipped.completion.percent).toBe(25);
  expect(await getOnboardingState(db, userId, NOW)).toEqual(skipped);
  const completed = await saveOnboardingStep(
    db,
    userId,
    { step: 'INTERESTS', tagIds: [interest.id] },
    NOW,
  );
  expect(status(completed, 'INTERESTS')).toBe('COMPLETED');
  expect(completed.completion.percent).toBe(50);
});

it('istemiyorum cevabı tamamlanır; atla mevcut false tercihini ve görünürlük değerini korur', async () => {
  const userId = await person('ALUMNI');
  const declined = await saveOnboardingStep(
    db,
    userId,
    { step: 'MENTOR_PREFERENCE', interested: false },
    NOW,
  );
  expect(status(declined, 'MENTOR_PREFERENCE')).toBe('COMPLETED');
  expect(declined.mentorInterested).toBe(false);
  expect(declined.completion.percent).toBe(40);
  const skipped = await skipOnboardingStep(db, userId, { step: 'MENTOR_PREFERENCE' }, NOW);
  expect(status(skipped, 'MENTOR_PREFERENCE')).toBe('SKIPPED');
  expect(skipped.mentorInterested).toBe(false);
  expect(skipped.completion.percent).toBe(20);
  await db.fieldVisibility.create({ data: { userId, field: 'EMAIL', level: 'PRIVATE' } });
  await skipOnboardingStep(db, userId, { step: 'VISIBILITY' }, NOW);
  expect(
    await db.fieldVisibility.findUniqueOrThrow({
      where: { userId_field: { userId, field: 'EMAIL' } },
    }),
  ).toMatchObject({ level: 'PRIVATE' });
  expect(await db.mentorProfile.count({ where: { userId } })).toBe(0);
});

it('hepsini atlayıp bitirme zorunlu beyanı korur; veriler durur, eksikler ve son adım kalır', async () => {
  const userId = await person('ACADEMIC');
  const interest = await tag();
  await saveOnboardingStep(db, userId, { step: 'INTERESTS', tagIds: [interest.id] }, NOW);
  const complete = await saveOnboardingStep(db, userId, { step: 'COMPLETE' }, NOW);
  expect(complete.step).toBe('COMPLETE');
  expect(status(complete, 'INTERESTS')).toBe('COMPLETED');
  for (const step of ['GOALS', 'MENTOR_PREFERENCE', 'VISIBILITY'])
    expect(status(complete, step)).toBe('SKIPPED');
  expect(complete.completion).toEqual({
    percent: 40,
    missing: ['GOALS', 'MENTOR_PREFERENCE', 'VISIBILITY'],
  });
  expect(complete.interestTagIds).toEqual([interest.id]);
  expect(await getOnboardingState(db, userId, NOW)).toEqual(complete);
});

it.each([
  [2025, 'NOT_UPPER_CLASS'],
  [2024, 'EXPERIENCE_UNAVAILABLE'],
  [2020, 'EXPERIENCE_UNAVAILABLE'],
])(
  'K-08 sunucuda reddeder: giriş yılı %i, sonuç %s (interested true/false ikisi de kapalı)',
  async (entryYear, reason) => {
    const userId = await person('STUDENT', entryYear);
    const state = await getOnboardingState(db, userId, NOW);
    expect(state.studentMentorEligibility).toEqual({ eligible: false, reason });
    expect(state.completion.missing).not.toContain('MENTOR_PREFERENCE');
    for (const interested of [true, false]) {
      await expect(
        saveOnboardingStep(db, userId, { step: 'MENTOR_PREFERENCE', interested }, NOW),
      ).rejects.toMatchObject({ code: 'MENTOR_NOT_ELIGIBLE' });
    }
    expect((await db.profile.findUniqueOrThrow({ where: { userId } })).mentorInterested).toBeNull();
    expect(await db.mentorProfile.count({ where: { userId } })).toBe(0);
  },
);

it('K-08 sınıf düzeltmesini ve kapanmış/reddedilmiş üyelikleri sunucudan okur', async () => {
  const userId = await person('STUDENT', 2024);
  await db.membership.updateMany({ where: { userId }, data: { classOffset: -1 } });
  await addMembership(db, { userId, departmentId, role: 'ACADEMIC', endedAt: NOW });
  await addMembership(db, { userId, departmentId, role: 'ALUMNI', status: 'REJECTED' });
  expect((await getOnboardingState(db, userId, NOW)).studentMentorEligibility).toEqual({
    eligible: false,
    reason: 'NOT_UPPER_CLASS',
  });
  await expect(
    saveOnboardingStep(db, userId, { step: 'MENTOR_PREFERENCE', interested: true }, NOW),
  ).rejects.toMatchObject({ code: 'MENTOR_NOT_ELIGIBLE' });
});

it('yanlış tür / bilinmeyen etiket tüm işlemi reddeder, eski seçimler ve adım korunur', async () => {
  const userId = await person();
  const interest = await tag();
  const goal = await tag('GOAL');
  const oldState = await saveOnboardingStep(
    db,
    userId,
    { step: 'INTERESTS', tagIds: [interest.id] },
    NOW,
  );
  for (const id of [goal.id, randomUUID()]) {
    await expect(
      saveOnboardingStep(db, userId, { step: 'INTERESTS', tagIds: [interest.id, id] }, NOW),
    ).rejects.toMatchObject({ code: 'PROFILE_TAG_INVALID' });
    expect(await getOnboardingState(db, userId, NOW)).toEqual(oldState);
  }
  for (const tagIds of [[], [interest.id, interest.id]]) {
    await expect(
      saveOnboardingStep(db, userId, { step: 'INTERESTS', tagIds }, NOW),
    ).rejects.toThrow();
  }
});

it('etiket değiştirme yalnız aynı türü etkiler; eşzamanlı ilgi/hedef kaydı birbirini kaybetmez', async () => {
  const userId = await person();
  const [first, second, goal, skill] = await Promise.all([tag(), tag(), tag('GOAL'), tag('SKILL')]);
  const profile = await db.profile.create({
    data: { userId, tags: { create: { tagId: skill.id } } },
  });
  await Promise.all([
    saveOnboardingStep(db, userId, { step: 'INTERESTS', tagIds: [first.id] }, NOW),
    saveOnboardingStep(db, userId, { step: 'GOALS', tagIds: [goal.id] }, NOW),
  ]);
  await saveOnboardingStep(db, userId, { step: 'INTERESTS', tagIds: [second.id] }, NOW);
  const state = await getOnboardingState(db, userId, NOW);
  expect(state.interestTagIds).toEqual([second.id]);
  expect(state.goalTagIds).toEqual([goal.id]);
  expect(status(state, 'GOALS')).toBe('COMPLETED');
  expect(await db.profileTag.count({ where: { profileId: profile.id } })).toBe(3);
  const listed = await listProfileTags(db, userId, { kind: 'INTEREST' });
  expect(listed.tags).toContainEqual({ id: second.id, kind: 'INTEREST', slug: second.slug });
  expect(listed.tags.every((item) => item.kind === 'INTEREST')).toBe(true);
});

it.each(['missing', 'deleted', 'suspended'] as const)(
  'güncel hesap koruması tüm servis yollarında kapalıdır: %s',
  async (kind) => {
    const userId =
      kind === 'missing'
        ? randomUUID()
        : await createUser(db, {
            banned: kind === 'suspended',
            deletedAt: kind === 'deleted' ? NOW : null,
          });
    const code = kind === 'suspended' ? 'AUTH_ACCOUNT_SUSPENDED' : 'AUTH_UNAUTHENTICATED';
    for (const call of [
      () => getOnboardingState(db, userId, NOW),
      () => saveOnboardingStep(db, userId, { step: 'COMPLETE' }, NOW),
      () => skipOnboardingStep(db, userId, { step: 'GOALS' }, NOW),
      () => listProfileTags(db, userId, { kind: 'INTEREST' }),
    ])
      await expect(call()).rejects.toMatchObject({ code });
    expect(await db.profile.count({ where: { userId } })).toBe(0);
  },
);

it.each(['DELETE', 'ANONYMIZE'] as const)(
  'K-09 %s: profil ve ilişkiler silinir; ortak etiket ve başka profil korunur',
  async (publishedContent) => {
    const userId = await person();
    const otherId = await person();
    const interest = await tag();
    await saveOnboardingStep(db, userId, { step: 'INTERESTS', tagIds: [interest.id] }, NOW);
    await saveOnboardingStep(db, otherId, { step: 'INTERESTS', tagIds: [interest.id] }, NOW);
    const own = await db.profile.update({
      where: { userId },
      data: {
        summary: 'kişisel özgeçmiş',
        socialLinks: { site: 'https://test.local' },
        linkedinUrl: 'https://linkedin.com/in/test',
      },
    });
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await deleteAccount(
      db,
      userId,
      { publishedContent, confirmEmail: user.email },
      { removeStoredFiles: null },
      NOW,
    );
    expect(await db.profile.count({ where: { userId } })).toBe(0);
    expect(await db.profileTag.count({ where: { profileId: own.id } })).toBe(0);
    expect(await db.tag.count({ where: { id: interest.id } })).toBe(1);
    expect((await getOnboardingState(db, otherId, NOW)).interestTagIds).toEqual([interest.id]);
    await expect(getOnboardingState(db, userId, NOW)).rejects.toMatchObject({
      code: 'AUTH_UNAUTHENTICATED',
    });
  },
);

it('hesap silmeyle eşzamanlı kayıt sonunda profil yeniden oluşmaz', async () => {
  const userId = await person();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const interest = await tag();
  await getOnboardingState(db, userId, NOW);
  const results = await Promise.allSettled([
    deleteAccount(
      db,
      userId,
      { publishedContent: 'DELETE', confirmEmail: user.email },
      { removeStoredFiles: null },
      NOW,
    ),
    saveOnboardingStep(db, userId, { step: 'INTERESTS', tagIds: [interest.id] }, NOW),
  ]);
  expect(results[0].status).toBe('fulfilled');
  if (results[1].status === 'rejected')
    expect(results[1].reason).toMatchObject({ code: 'AUTH_UNAUTHENTICATED' });
  expect(await db.profile.count({ where: { userId } })).toBe(0);
});

it('döküm yalnız kendi profilini, tüm kişisel alanlarını ve etiketlerini kapalı şemada içerir', async () => {
  const userId = await person();
  const otherId = await person();
  const interest = await tag();
  await saveOnboardingStep(db, userId, { step: 'INTERESTS', tagIds: [interest.id] }, NOW);
  await db.profile.update({
    where: { userId },
    data: {
      headline: 'Başlık',
      summary: 'Özet',
      city: 'İstanbul',
      goals: 'Hedef',
      socialLinks: { site: 'https://own.local' },
      linkedinUrl: 'https://linkedin.com/in/own',
      cvUpdatedAt: NOW,
      lastFreshnessPromptAt: NOW,
      lastStillThereCheckAt: NOW,
    },
  });
  await db.profile.create({
    data: {
      userId: otherId,
      summary: 'BAŞKA_KİŞİ_GİZLİ_ÖZET',
      socialLinks: { site: 'https://other-secret.local' },
    },
  });
  const exported = await buildDataExport(db, userId, NOW);
  expect(dataExportSchema.safeParse(exported).success).toBe(true);
  expect(exported.profile).toMatchObject({
    headline: 'Başlık',
    summary: 'Özet',
    city: 'İstanbul',
    goals: 'Hedef',
    socialLinks: { site: 'https://own.local' },
    linkedinUrl: 'https://linkedin.com/in/own',
    onboardingStep: 'GOALS',
    completedSteps: ['MEMBERSHIP', 'INTERESTS'],
    skippedSteps: [],
    cvUpdatedAt: NOW.toISOString(),
    lastFreshnessPromptAt: NOW.toISOString(),
    lastStillThereCheckAt: NOW.toISOString(),
    tags: [{ id: interest.id, kind: 'INTEREST', slug: interest.slug }],
  });
  const json = JSON.stringify(exported);
  expect(json).not.toContain('BAŞKA_KİŞİ_GİZLİ_ÖZET');
  expect(json).not.toContain('other-secret.local');
  expect(json).not.toContain(otherId);
  expect(exported.profile).not.toHaveProperty('user');
  const emptyUser = await createUser(db);
  expect((await buildDataExport(db, emptyUser, NOW)).profile).toBeNull();
});
