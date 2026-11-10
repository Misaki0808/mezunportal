import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';

import { seedAccounts, seedUserId } from './seed-accounts';
import { seedDictionary } from './seed-dictionary';
import { seedInstitutions } from './seed-institutions';
import { seedPhase2 } from './seed-phase2';
import { seedProfileTags } from './seed-profile-tags';
import { seedId } from './seed-util';

const db = createTestPrisma();
const NOW = new Date('2030-03-10T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const ids = (kind: string, keys: string[]) => keys.map((key) => seedId('phase2', `${kind}:${key}`));
const POSTINGS = ids('posting', [
  'veri-analizi-staj',
  'is-analizi-staj',
  'erp-junior',
  'urun-staj-incelemede',
  'pazarlama-taslak',
]);
const EVENTS = ids('event', ['kariyer-sohbeti', 'cv-atolyesi']);
const EXPERIENCES = ids('experience', [
  'yazilim-yaz',
  'yazilim-kis',
  'finans-yaz',
  'perakende-yaz',
  'erasmus',
  'kulup',
]);
const COMPANIES = ids('company', ['yazilim', 'finans', 'perakende']);

async function cleanup() {
  await db.jobPosting.deleteMany({ where: { id: { in: POSTINGS } } });
  await db.campusEvent.deleteMany({ where: { id: { in: EVENTS } } });
  await db.experience.deleteMany({ where: { id: { in: EXPERIENCES } } });
  await db.company.deleteMany({ where: { id: { in: COMPANIES } } });
}

beforeAll(async () => {
  await seedInstitutions(db);
  await seedAccounts(db);
  await seedProfileTags(db);
  await seedDictionary(db);
  await cleanup();
});
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe('Faz 2 deneme verisi (P2-14)', () => {
  it('yazar, ilan, etkinlik, deneyim ve şirketleri yazar; tekrar koşunca çoğalmaz', async () => {
    await seedPhase2(db, NOW);
    await seedPhase2(db, NOW);
    expect(await db.company.count({ where: { id: { in: COMPANIES } } })).toBe(3);
    expect(await db.experience.count({ where: { id: { in: EXPERIENCES } } })).toBe(6);
    expect(await db.jobPosting.count({ where: { id: { in: POSTINGS } } })).toBe(5);
    expect(await db.campusEvent.count({ where: { id: { in: EVENTS } } })).toBe(2);
    expect(await db.jobPostingDepartment.count({ where: { postingId: { in: POSTINGS } } })).toBe(5);
    const states = (
      await db.jobPosting.findMany({ where: { id: { in: POSTINGS } }, select: { status: true } })
    )
      .map((p) => p.status)
      .sort();
    expect(states).toEqual(['DRAFT', 'PENDING', 'PUBLISHED', 'PUBLISHED', 'PUBLISHED']);
  });

  it('her şey sahte ve işaretli: şirket adı "Örnek", metinlerde "örnek"/"inceleme"/"taslak" işareti; yazarlar yalnız test hesapları', async () => {
    await seedPhase2(db, NOW);
    const companies = await db.company.findMany({ where: { id: { in: COMPANIES } } });
    for (const company of companies) expect(company.name.startsWith('Örnek')).toBe(true);
    const experiences = await db.experience.findMany({ where: { id: { in: EXPERIENCES } } });
    for (const e of experiences) {
      expect(e.organizationName?.startsWith('Örnek')).toBe(true);
      expect(e.whatLearned.startsWith('Örnek')).toBe(true);
    }
    const testUsers = new Set((['alumniMentor', 'seniorMentor'] as const).map(seedUserId));
    for (const e of experiences.filter((x) => !x.isAnonymous))
      expect(testUsers.has(e.authorId!)).toBe(true);
    // anonim deneyimde yazar kimliği yok
    const anonymous = experiences.find((e) => e.isAnonymous);
    expect(anonymous?.authorId).toBeNull();
    const postings = await db.jobPosting.findMany({ where: { id: { in: POSTINGS } } });
    for (const p of postings) expect(p.authorId).toBe(seedUserId('alumniMentor'));
    for (const p of postings.filter((x) => x.status === 'PUBLISHED'))
      expect(p.title).toContain('örnek ilan');
  });

  it('tarihler çalışma anına göredir: son başvuru gelecekte, yayın yakın geçmişte, etkinlik yakında; ileri tarihli tekrar koşu tazeler', async () => {
    await seedPhase2(db, NOW);
    const published = await db.jobPosting.findMany({
      where: { id: { in: POSTINGS }, status: 'PUBLISHED' },
    });
    expect(published).toHaveLength(3);
    for (const p of published) {
      expect(p.deadlineOn!.getTime()).toBeGreaterThan(NOW.getTime());
      expect(p.publishedAt!.getTime()).toBeLessThan(NOW.getTime());
      // en çok 60 gün (veritabanı CHECK'i de zorlar)
      expect(p.deadlineOn!.getTime() - p.publishedAt!.getTime()).toBeLessThanOrEqual(61 * DAY);
    }
    const event = await db.campusEvent.findUniqueOrThrow({ where: { id: EVENTS[0]! } });
    expect(event.status).toBe('PUBLISHED');
    expect(event.startsAt.getTime()).toBeGreaterThan(NOW.getTime());
    const later = new Date(NOW.getTime() + 30 * DAY);
    await seedPhase2(db, later);
    const refreshed = await db.jobPosting.findUniqueOrThrow({ where: { id: POSTINGS[0]! } });
    expect(refreshed.deadlineOn!.getTime()).toBeGreaterThan(later.getTime());
    expect(await db.jobPosting.count({ where: { id: { in: POSTINGS } } })).toBe(5);
  });

  it('moderatör ekranı için incelemede ilan ve etkinlik, taslak ilan bırakır (karar izi yok)', async () => {
    await seedPhase2(db, NOW);
    const pending = await db.jobPosting.findUniqueOrThrow({ where: { id: POSTINGS[3]! } });
    expect(pending).toMatchObject({ status: 'PENDING', moderatedById: null, publishedAt: null });
    const draft = await db.jobPosting.findUniqueOrThrow({ where: { id: POSTINGS[4]! } });
    expect(draft).toMatchObject({ status: 'DRAFT', submittedAt: null });
    const pendingEvent = await db.campusEvent.findUniqueOrThrow({ where: { id: EVENTS[1]! } });
    expect(pendingEvent).toMatchObject({ status: 'PENDING', reviewedById: null });
  });

  it('başvuru takvimi, şirket sayfası ve soru bankası için yeterli yayınlanmış staj deneyimi var', async () => {
    await seedPhase2(db, NOW);
    const internships = await db.experience.findMany({
      where: { id: { in: EXPERIENCES }, type: 'INTERNSHIP', status: 'PUBLISHED' },
    });
    expect(internships).toHaveLength(4);
    expect(new Set(internships.map((e) => e.companyId)).size).toBe(3);
    expect(
      internships.filter((e) => e.interviewQuestions.length > 0).length,
    ).toBeGreaterThanOrEqual(3);
    expect(internships.filter((e) => e.appliedMonth !== null).length).toBe(4);
  });
});
