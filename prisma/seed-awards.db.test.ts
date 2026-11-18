import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { addMembership, grantRequiredConsents } from '@/test/fixtures';

import {
  listAwardCandidates,
  listMyAwards,
  publicAward,
  selectYearAlumnus,
  setAwardPublication,
} from '../src/server/services/year-alumni';
import { seedAccounts, seedUserId } from './seed-accounts';
import { seedAwardScenario } from './seed-awards';
import { seedCourses } from './seed-courses';
import { seedDictionary } from './seed-dictionary';
import { seedInstitutions } from './seed-institutions';
import { sampleAlumnusId } from './seed-phase2';
import { seedProfileTags } from './seed-profile-tags';

const db = createTestPrisma();
const DAY = 24 * 60 * 60 * 1000;
const YEARS = [2023, 2024];
const SAMPLES = (['ornek-mezun-1', 'ornek-mezun-2'] as const).map(sampleAlumnusId);
let departmentId = '';

const cycles = () =>
  db.awardCycle.findMany({
    where: { departmentId, year: { in: YEARS } },
    orderBy: { year: 'asc' },
    // Doğrulama kodu istemcide varsayılan olarak gizlidir (omit); testte açıkça istenir.
    include: {
      candidates: { orderBy: { userId: 'asc' } },
      awards: { omit: { verificationCode: false } },
    },
  });

async function snapshot() {
  const rows = await cycles();
  const targets = rows.flatMap((c) => [c.id, ...c.awards.map((a) => a.id)]);
  const audit = await db.adminAuditLog.findMany({
    where: { targetId: { in: targets } },
    orderBy: [{ action: 'asc' }, { targetId: 'asc' }],
  });
  return JSON.stringify({ rows, audit });
}

async function cleanup() {
  await db.award.deleteMany({ where: { departmentId, year: { in: YEARS } } });
  await db.awardCycle.deleteMany({ where: { departmentId, year: { in: YEARS } } });
}

async function consentOnce(userId: string) {
  if ((await db.consent.count({ where: { userId } })) === 0)
    await grantRequiredConsents(db, userId);
}

beforeAll(async () => {
  await seedInstitutions(db);
  await seedCourses(db);
  await seedAccounts(db);
  await seedProfileTags(db);
  await seedDictionary(db);
  departmentId = (await db.department.findFirstOrThrow({ where: { code: 'YBS' } })).id;
  // İki örnek mezun (seed-phase2 ile aynı sabit kimlikler); testin sonunda silinir.
  for (const [index, id] of SAMPLES.entries()) {
    await db.user.upsert({
      where: { id },
      create: {
        id,
        name: `Örnek Mezun ${index + 1}`,
        email: `ornek-mezun-${index + 1}@test.mezunportal.local`,
        emailVerified: true,
      },
      update: {},
    });
    if (!(await db.membership.count({ where: { userId: id, departmentId } })))
      await addMembership(db, {
        userId: id,
        departmentId,
        role: 'ALUMNI',
        graduationYear: 2023,
        verifiedById: seedUserId('systemAdmin'),
      });
  }
  await cleanup();
});
beforeEach(async () => {
  vi.unstubAllEnvs();
  await cleanup();
});
afterAll(async () => {
  await cleanup();
  await db.membership.deleteMany({ where: { userId: { in: SAMPLES } } });
  await db.user.deleteMany({ where: { id: { in: SAMPLES } } });
  await db.$disconnect();
});

describe('Yılın Mezunu deneme senaryosu (kart 470)', () => {
  it('yalnız APP_ENV local/test iken yazar; prod, bilinmeyen ve tanımsız ortamda hiçbir şey yazmaz', async () => {
    await seedAwardScenario(db, 'prod');
    await seedAwardScenario(db, 'production');
    await seedAwardScenario(db, '');
    vi.stubEnv('APP_ENV', 'prod');
    await seedAwardScenario(db);
    vi.stubEnv('APP_ENV', undefined);
    await seedAwardScenario(db);
    expect(await cycles()).toHaveLength(0);
    vi.stubEnv('APP_ENV', 'test');
    await seedAwardScenario(db);
    expect(await cycles()).toHaveLength(2);
  });

  it('iki donmuş dönem yazar: 30 gün kuralı, aday kümesi, tek ödül ve işlem kaydı tutarlı; rıza uydurmaz', async () => {
    await seedAwardScenario(db, 'local');
    const [open, awarded] = await cycles();
    expect([open!.year, awarded!.year]).toEqual([2023, 2024]);
    for (const cycle of [open!, awarded!]) {
      // Tören İstanbul gününün başı; dondurma törenden 30 gün önce, işin 2 dakikalık payı içinde.
      expect(cycle.ceremonyAt.toISOString()).toMatch(/T21:00:00\.000Z$/);
      const lag = cycle.frozenAt!.getTime() - (cycle.ceremonyAt.getTime() - 30 * DAY);
      expect(lag).toBeGreaterThanOrEqual(0);
      expect(lag).toBeLessThanOrEqual(2 * 60_000);
      expect(cycle.candidates.map((c) => c.userId)).toEqual(
        [seedUserId('alumniMentor'), ...SAMPLES].sort(),
      );
      for (const c of cycle.candidates) {
        expect([c.points, c.experienceCount, c.meetingCount]).toEqual([0, 0, 0]);
      }
    }
    expect(open!.awards).toHaveLength(0);
    expect(awarded!.awards).toHaveLength(1);
    const award = awarded!.awards[0]!;
    expect(award).toMatchObject({
      kind: 'YEAR_ALUMNI',
      userId: seedUserId('alumniMentor'),
      departmentId,
      year: 2024,
      publicConsentAt: null,
      publicConsentVersion: null,
    });
    expect(award.verificationCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await db.awardPublicationDecision.count({ where: { awardId: award.id } })).toBe(0);
    const audit = await db.adminAuditLog.findMany({
      where: { targetId: { in: [open!.id, awarded!.id, award.id] } },
      orderBy: { action: 'asc' },
    });
    expect(audit.map((a) => `${a.action}:${a.targetType}`)).toEqual([
      'AWARD_CYCLE_CONFIGURE:AWARD_CYCLE',
      'AWARD_CYCLE_CONFIGURE:AWARD_CYCLE',
      'AWARD_SELECT:AWARD',
    ]);
    expect(audit.every((a) => a.actorId === seedUserId('departmentAdmin'))).toBe(true);
    expect(audit.find((a) => a.action === 'AWARD_SELECT')!.reason).toContain('Örnek veri');
  });

  it('iki kez koşunca aynı sonuç: çift kayıt yok, hiçbir satır değişmez', async () => {
    await seedAwardScenario(db, 'local');
    const first = await snapshot();
    await seedAwardScenario(db, 'local');
    await seedAwardScenario(db, 'test');
    expect(await snapshot()).toBe(first);
    expect(await db.awardCycle.count({ where: { departmentId, year: { in: YEARS } } })).toBe(2);
    expect(await db.award.count({ where: { departmentId, year: { in: YEARS } } })).toBe(1);
  });

  it('var olan döngüye dokunmaz; ödül kazananı aday değilse o döngüyü kurmaz', async () => {
    const own = await db.awardCycle.create({
      data: { departmentId, year: 2023, ceremonyAt: new Date('2099-06-30T00:00:00+03:00') },
    });
    await seedAwardScenario(db, 'local');
    const [first, second] = await cycles();
    expect(first).toMatchObject({ id: own.id, frozenAt: null });
    expect(first!.candidates).toHaveLength(0);
    expect(second!.year).toBe(2024);
    await cleanup();
    // Kazanan açık şüphe kaydı yüzünden uygun aday değilse ödüllü döngü kurulmaz; öteki döngü kurulur.
    const flag = await db.suspicionFlag.create({
      data: {
        userId: seedUserId('alumniMentor'),
        rule: 'BURST',
        evidenceKey: `seed-awards-test-${Date.now()}`,
        entryIds: [],
        windowStart: new Date(),
        windowEnd: new Date(),
        entryCount: 0,
        points: 0,
      },
    });
    try {
      await seedAwardScenario(db, 'local');
      const rows = await cycles();
      expect(rows.map((c) => c.year)).toEqual([2023]);
      expect(rows[0]!.awards).toHaveLength(0);
      expect(rows[0]!.candidates.map((c) => c.userId)).toEqual([...SAMPLES].sort());
    } finally {
      await db.suspicionFlag.delete({ where: { id: flag.id } });
    }
  });

  it('uygulamanın gerçek servisleriyle uyumlu: aday listesi, seçim, yayın rızası, doğrulama sayfası', async () => {
    const admin = seedUserId('departmentAdmin');
    const mentor = seedUserId('alumniMentor');
    await consentOnce(admin);
    await consentOnce(mentor);
    await seedAwardScenario(db, 'local');
    const deps = { db };

    const open = await listAwardCandidates(deps, admin, { departmentId, year: 2023 });
    expect(open.frozenAt).not.toBeNull();
    expect(open.selectedUserId).toBeNull();
    expect(open.candidates.map((c) => c.userId)).toContain(mentor);
    const awarded = await listAwardCandidates(deps, admin, { departmentId, year: 2024 });
    expect(awarded.selectedUserId).toBe(mentor);
    expect(awarded.selectedNeedsReview).toBe(false);

    const mine = await listMyAwards(deps, mentor);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ year: 2024, isPublic: false, verificationUrl: null });
    const code = (
      await db.award.findFirstOrThrow({
        where: { departmentId, year: 2024 },
        omit: { verificationCode: false },
      })
    ).verificationCode;
    expect(await publicAward(db, code)).toBeNull();
    const published = await setAwardPublication(deps, mentor, {
      awardId: mine[0]!.id,
      public: true,
    });
    expect(published.isPublic).toBe(true);
    expect(published.verificationUrl).toContain(`/dogrula/${code}`);
    expect(await publicAward(db, code)).toMatchObject({ year: 2024, award: 'Yılın Mezunu' });
    // Yeniden koşu rızaya ve ödüle dokunmaz.
    await seedAwardScenario(db, 'local');
    expect(await publicAward(db, code)).not.toBeNull();
    await setAwardPublication(deps, mentor, { awardId: mine[0]!.id, public: false });
    expect(await publicAward(db, code)).toBeNull();

    // 2023: seçim düğmesi gerçekten çalışır; döngü başına tek ödül.
    const picked = await selectYearAlumnus(deps, admin, {
      departmentId,
      year: 2023,
      userId: mentor,
      reason: 'Deneme turu',
    });
    expect(picked.awardId).toBeTruthy();
    expect(
      (await listAwardCandidates(deps, admin, { departmentId, year: 2023 })).selectedUserId,
    ).toBe(mentor);
    await expect(
      selectYearAlumnus(deps, admin, {
        departmentId,
        year: 2023,
        userId: SAMPLES[0]!,
        reason: 'İkinci seçim',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_INVALID' });
    await expect(
      selectYearAlumnus(deps, admin, {
        departmentId,
        year: 2024,
        userId: SAMPLES[0]!,
        reason: 'Ödüllü yıl',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_INVALID' });
    expect((await listMyAwards(deps, mentor)).map((a) => a.year)).toEqual([2023, 2024]);
  });
});
