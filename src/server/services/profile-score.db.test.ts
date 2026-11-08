import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser, type Institution } from '@/test/fixtures';

import * as content from './profile-content';
import { loadProfileCompletion, saveOnboardingStep, syncCompletionScore } from './profile';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
let inst: Institution;
beforeAll(async () => {
  inst = await createInstitution(db);
});
const NOW = new Date('2030-03-03T10:00:00Z');
const deps = { db, now: () => NOW };
const tag = () => `zs${randomUUID().replace(/-/g, '').slice(0, 10)}`;

async function student() {
  const userId = await createUser(db);
  await addMembership(db, { userId, departmentId: inst.deptA1, role: 'STUDENT', entryYear: 2024 });
  return userId;
}
const stored = async (userId: string) =>
  (await db.profile.findUniqueOrThrow({ where: { userId } })).completionScore;

describe('Profile.completionScore tek kaynak', () => {
  it('her profil yazımından sonra saklı skor, profil sayfasındaki yüzde ve kuraldan gelen yüzdeyle aynıdır', async () => {
    const userId = await student();
    const check = async (label: string, view: { completion: { percent: number } }) => {
      expect(await stored(userId), label).toBe(view.completion.percent);
      expect((await loadProfileCompletion(db, userId, NOW)).percent, label).toBe(
        view.completion.percent,
      );
    };
    await check(
      'temel',
      await content.updateProfileBasics(deps, userId, { headline: 'Başlık', city: 'İstanbul' }),
    );
    const afterBasics = await stored(userId);
    expect(afterBasics).toBeGreaterThan(0);
    const education = await content.saveProfileEntry(deps, userId, {
      section: 'EDUCATION',
      values: {
        institution: 'Ü',
        level: null,
        fieldOfStudy: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
      },
    });
    await check('eğitim', education);
    expect(await stored(userId)).toBeGreaterThan(afterBasics);
    for (const name of ['Bir', 'İki', 'Üç']) {
      await check(
        `beceri ${name}`,
        await content.addProfileSkill(deps, userId, { name: `${name}${tag()}` }),
      );
    }
    const full = await stored(userId);
    const removed = await content.removeProfileSkill(deps, userId, {
      tagId: (await content.getMyProfile(deps, userId)).skills[0]!.tagId,
    });
    await check('beceri silme', removed);
    expect(await stored(userId)).toBeLessThan(full);
    await check(
      'eğitim silme',
      await content.deleteProfileEntry(deps, userId, {
        section: 'EDUCATION',
        id: education.education[0]!.id,
      }),
    );
    await check('bağlantı', await content.setSocialLinks(deps, userId, { links: [] }));
    await check('LinkedIn', await content.setLinkedinUrl(deps, userId, { url: null }));
  });

  it('başlık/şehri temizlemek skoru düşürür; CV uygulanması adım olarak sayılır', async () => {
    const userId = await student();
    await content.updateProfileBasics(deps, userId, { headline: 'Başlık', city: 'Ankara' });
    const withBasics = await stored(userId);
    await content.updateProfileBasics(deps, userId, { city: null });
    expect(await stored(userId)).toBeLessThan(withBasics);
    await content.updateProfileBasics(deps, userId, { city: 'Ankara' });
    const before = await stored(userId);
    await db.profile.update({ where: { userId }, data: { cvUpdatedAt: NOW } });
    await syncCompletionScore(db, userId, NOW);
    expect(await stored(userId)).toBeGreaterThan(before);
  });

  it('ilk giriş adımı kaydı da aynı kuraldan günceller (ilk giriş yüzdesinden bağımsız)', async () => {
    const userId = await student();
    const goal = await db.tag.upsert({
      where: { kind_slug: { kind: 'GOAL', slug: 'internship' } },
      create: { kind: 'GOAL', slug: 'internship' },
      update: {},
    });
    const state = await saveOnboardingStep(db, userId, { step: 'GOALS', tagIds: [goal.id] }, NOW);
    expect(await stored(userId)).toBe((await loadProfileCompletion(db, userId, NOW)).percent);
    // İlk giriş ekranının kendi yüzdesi ayrıdır; saklı skor içerik adımlarını da paydaya katar.
    expect(await stored(userId)).toBeLessThan(100);
    expect(state.completion.percent).toBeGreaterThan(0);
  });

  it('profil satırı olmayan kullanıcıda senkronizasyon satır açmaz', async () => {
    const userId = await student();
    await syncCompletionScore(db, userId, NOW);
    expect(await db.profile.count({ where: { userId } })).toBe(0);
  });

  it('senkronizasyon yazım zamanını (enjekte saat) "son güncelleme" olarak bırakır', async () => {
    const userId = await student();
    const view = await content.updateProfileBasics(deps, userId, { headline: 'Saat' });
    expect(view.lastUpdatedAt).toEqual(NOW);
  });
});
