import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { addMembership, createUser, grantRequiredConsents } from '@/test/fixtures';

import { getApplicationCalendar } from '../src/server/services/application-window';
import { getCompany, searchCompanies } from '../src/server/services/companies';
import { getInterviewQuestions } from '../src/server/services/interview-questions';
import { searchJobPostings } from '../src/server/services/job-postings';
import { seedAccounts, seedUserId } from './seed-accounts';
import { seedDictionary } from './seed-dictionary';
import { seedInstitutions } from './seed-institutions';
import { SAMPLE_ALUMNI, seedPhase2 } from './seed-phase2';
import { seedProfileTags } from './seed-profile-tags';
import { seedUuid } from './seed-util';

const db = createTestPrisma();
const NOW = new Date('2030-03-10T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const ids = (kind: string, keys: string[]) =>
  keys.map((key) => seedUuid('phase2', `${kind}:${key}`));
const POSTINGS = ids('posting', [
  'veri-analizi-staj',
  'is-analizi-staj',
  'erp-junior',
  'urun-staj-incelemede',
  'pazarlama-taslak',
]);
const EVENTS = ids('event', ['kariyer-sohbeti', 'cv-atolyesi']);
const EXPERIENCES = ids('experience', [
  'yazilim-mert',
  'yazilim-elif',
  'yazilim-1',
  'yazilim-2',
  'finans-mert',
  'finans-2',
  'finans-3',
  'perakende-1',
  'perakende-3',
  'perakende-4',
  'erasmus',
  'kulup',
]);
const COMPANIES = ids('company', ['yazilim', 'finans', 'perakende']);
const SAMPLE_USERS = SAMPLE_ALUMNI.map((key) => seedUuid('phase2', `user:${key}`));
let viewer = '';

async function cleanup() {
  await db.jobPosting.deleteMany({ where: { id: { in: POSTINGS } } });
  await db.campusEvent.deleteMany({ where: { id: { in: EVENTS } } });
  await db.experience.deleteMany({ where: { id: { in: EXPERIENCES } } });
  await db.position.deleteMany({ where: { userId: { in: SAMPLE_USERS } } });
  await db.company.deleteMany({ where: { id: { in: COMPANIES } } });
  // Görüntüleyen öğrenci kalır: rıza kayıtları yalnız eklenir (silinemez), diğer testler de kullanıcılarını bırakır.
  await db.membership.deleteMany({ where: { userId: { in: SAMPLE_USERS } } });
  await db.user.deleteMany({ where: { id: { in: SAMPLE_USERS } } });
}

beforeAll(async () => {
  await seedInstitutions(db);
  await seedAccounts(db);
  await seedProfileTags(db);
  await seedDictionary(db);
  await cleanup();
  // Seed'in İÜ YBS bölümünde bir öğrenci (K-07: aynı üniversite) ve rıza kapısı açık.
  const department = await db.department.findFirstOrThrow({
    where: { code: 'YBS' },
    select: { id: true },
  });
  viewer = await createUser(db);
  await addMembership(db, {
    userId: viewer,
    departmentId: department.id,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await grantRequiredConsents(db, viewer);
});
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe('Faz 2 deneme verisi (P2-14)', () => {
  it('yazar, ilan, etkinlik, deneyim, pozisyon ve şirketleri yazar; tekrar koşunca çoğalmaz', async () => {
    await seedPhase2(db, NOW);
    await seedPhase2(db, NOW);
    expect(await db.company.count({ where: { id: { in: COMPANIES } } })).toBe(3);
    expect(await db.experience.count({ where: { id: { in: EXPERIENCES } } })).toBe(12);
    expect(await db.jobPosting.count({ where: { id: { in: POSTINGS } } })).toBe(5);
    expect(await db.campusEvent.count({ where: { id: { in: EVENTS } } })).toBe(2);
    expect(await db.user.count({ where: { id: { in: SAMPLE_USERS } } })).toBe(4);
    expect(
      await db.position.count({
        where: {
          userId: { in: [...SAMPLE_USERS, seedUserId('alumniMentor')] },
          company: { id: { in: COMPANIES } },
        },
      }),
    ).toBe(9);
    expect(await db.jobPostingDepartment.count({ where: { postingId: { in: POSTINGS } } })).toBe(5);
    const states = (
      await db.jobPosting.findMany({ where: { id: { in: POSTINGS } }, select: { status: true } })
    )
      .map((p) => p.status)
      .sort();
    expect(states).toEqual(['DRAFT', 'PENDING', 'PUBLISHED', 'PUBLISHED', 'PUBLISHED']);
  });

  it('her şey sahte ve işaretli: şirket "Örnek", metinler "Örnek veri"; örnek mezunlar giriş yapamaz (oturum/hesap kaydı yok); anonim deneyim yok', async () => {
    await seedPhase2(db, NOW);
    const companies = await db.company.findMany({ where: { id: { in: COMPANIES } } });
    for (const company of companies) expect(company.name.startsWith('Örnek')).toBe(true);
    const experiences = await db.experience.findMany({ where: { id: { in: EXPERIENCES } } });
    for (const e of experiences) {
      expect(e.organizationName?.startsWith('Örnek')).toBe(true);
      expect(e.whatLearned.startsWith('Örnek veri')).toBe(true);
      expect(e.isAnonymous).toBe(false);
    }
    const allowed = new Set([
      ...SAMPLE_USERS,
      seedUserId('alumniMentor'),
      seedUserId('seniorMentor'),
    ]);
    for (const e of experiences) expect(allowed.has(e.authorId!)).toBe(true);
    // örnek mezunların oturum/hesap (giriş) kaydı yok
    expect(await db.session.count({ where: { userId: { in: SAMPLE_USERS } } })).toBe(0);
    expect(await db.account.count({ where: { userId: { in: SAMPLE_USERS } } })).toBe(0);
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
});

describe('seed gerçekten GÖRÜNÜR içerik üretir (servisler k-anonimlik eşikleriyle birlikte)', () => {
  // Seed saati gerçek saat olmalı: ilan görünürlüğü "son tarih ≥ bugün" ister.
  beforeAll(async () => {
    await seedPhase2(db, new Date());
  });

  it('öğrenci üç yayında ilanı görür; incelemede ve taslak ilan görünmez', async () => {
    const result = await searchJobPostings({ db }, viewer, {});
    const seeded = result.items.filter((item) => POSTINGS.includes(item.id));
    expect(seeded.map((i) => i.id).sort()).toEqual(
      [POSTINGS[0]!, POSTINGS[1]!, POSTINGS[2]!].sort(),
    );
  });

  it('soru bankası: her örnek şirket en az üç farklı yazardan ortak soru gösterir', async () => {
    const bank = await getInterviewQuestions(db, viewer, { q: '', companyId: '', sectorId: '' });
    for (const id of COMPANIES) {
      const group = bank.groups.find((g) => g.companyId === id);
      expect(group, id).toBeDefined();
      expect(group!.questions.length).toBeGreaterThan(0);
    }
  });

  it('başvuru takvimi: örnek şirketlerde en az üç yazarlı ay dilimi görünür (anonim deneyim yok)', async () => {
    for (const id of COMPANIES) {
      const calendar = await getApplicationCalendar(db, viewer, { kind: 'COMPANY', id });
      expect(calendar.months.length, id).toBeGreaterThan(0);
      for (const month of calendar.months) expect(month.count).toBeGreaterThanOrEqual(3);
    }
  });

  it('şirket sayfası: yazarlı deneyimler, 3 mezunluk çalışan hücresi ve dönem kesiti görünür; 3 altı hücre gizli; e-posta yok', async () => {
    const found = await searchCompanies({ db }, viewer, 'Örnek');
    const names = found.companies.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['Örnek Yazılım A.Ş.', 'Örnek Finans Teknolojileri']),
    );
    const software = found.companies.find((c) => c.id === COMPANIES[0])!;
    const detail = await getCompany({ db }, viewer, software.slug);
    expect(detail.name).toBe('Örnek Yazılım A.Ş.');
    expect(detail.experiences.length).toBeGreaterThanOrEqual(3);
    expect(detail.alumni).toEqual({ current: 3, former: null }); // geçmiş çalışan 2 kişi: 3'ün altı gizli
    expect(detail.periods.map((p) => p.season)).toContain('SUMMER');
    const finance = found.companies.find((c) => c.id === COMPANIES[1])!;
    expect((await getCompany({ db }, viewer, finance.slug)).alumni).toEqual({
      current: 3,
      former: null,
    });
    expect(JSON.stringify(detail)).not.toContain('@test.mezunportal.local');
  });
});
