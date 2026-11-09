import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import {
  configureAwardCycle,
  freezeDueAwardCycles,
  listAwardCandidates,
  recalculateAwardCycle,
  selectYearAlumnus,
  setAwardPublication,
  publicAward,
} from './year-alumni';
import { decideSuspicion } from './points-admin';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
const BEFORE = new Date('2026-05-01T00:00:00Z'),
  FREEZE = new Date('2026-05-30T21:00:00Z');
const deps = (now = BEFORE) => ({ db, now: () => now });
async function fixture() {
  const inst = await createInstitution(db),
    admin = await createUser(db),
    owner = await createUser(db),
    other = await createUser(db);
  for (const userId of [admin, owner, other]) await grantRequiredConsents(db, userId);
  await addMembership(db, { userId: admin, role: 'ACADEMIC', departmentId: inst.deptA1 });
  await addGrant(db, { userId: admin, scope: 'SYSTEM' });
  await addMembership(db, { userId: owner, role: 'ALUMNI', departmentId: inst.deptA1 });
  await addMembership(db, { userId: other, role: 'ALUMNI', departmentId: inst.deptA2 });
  const key = { departmentId: inst.deptA1, year: 2025 };
  await configureAwardCycle(deps(), admin, { ...key, ceremonyDate: '2026-06-30' });
  return { inst, admin, owner, other, key };
}
const point = (userId: string, eventAt: string) =>
  db.pointEntry.create({
    data: {
      userId,
      action: 'SESSION_ONLINE',
      sourceType: 'APPOINTMENT',
      sourceId: randomUUID(),
      basePoints: 10,
      points: 10,
      status: 'FINAL',
      eventAt: new Date(eventAt),
    },
  });
it('akademik yıl iki sınırı, dondurma ve iki dakikalık gecikme sınırı kararlı', async () => {
  const w = await fixture();
  for (const at of [
    '2025-08-31T20:59:59.999Z',
    '2025-08-31T21:00:00Z',
    '2026-08-31T20:59:59.999Z',
    '2026-08-31T21:00:00Z',
  ])
    await point(w.owner, at);
  expect((await listAwardCandidates(deps(), w.admin, w.key)).candidates[0]?.points).toBe(20);
  await freezeDueAwardCycles(db, new Date(+FREEZE - 1));
  expect(
    (await listAwardCandidates(deps(new Date(+FREEZE - 1)), w.admin, w.key)).frozenAt,
  ).toBeNull();
  await freezeDueAwardCycles(db, FREEZE);
  await point(w.owner, '2026-05-30T21:01:00Z');
  await freezeDueAwardCycles(db, new Date(+FREEZE + 60_000));
  const frozen = await listAwardCandidates(deps(new Date(+FREEZE + 60_000)), w.admin, w.key);
  expect(frozen.frozenAt).toEqual(FREEZE);
  expect(frozen.candidates[0]?.points).toBe(20);
  await expect(
    recalculateAwardCycle(deps(new Date(+FREEZE + 60_000)), w.admin, { ...w.key, reason: '' }),
  ).rejects.toThrow();
  const recalculated = await recalculateAwardCycle(deps(new Date(+FREEZE + 60_000)), w.admin, {
    ...w.key,
    reason: 'Güncel katkılar',
  });
  expect(recalculated.candidates[0]?.points).toBe(30);
  expect(
    await db.adminAuditLog.count({ where: { actorId: w.admin, action: 'AWARD_RECALCULATE' } }),
  ).toBe(1);
  for (const [year, delay, allowed] of [
    [2024, 120_000, true],
    [2023, 120_001, false],
  ] as const) {
    const key = { ...w.key, year };
    await configureAwardCycle(deps(), w.admin, { ...key, ceremonyDate: '2026-06-30' });
    await freezeDueAwardCycles(db, new Date(+FREEZE + delay));
    if (allowed)
      expect(
        (await listAwardCandidates(deps(new Date(+FREEZE + delay)), w.admin, key)).frozenAt,
      ).not.toBeNull();
    else
      await expect(
        listAwardCandidates(deps(new Date(+FREEZE + delay)), w.admin, key),
      ).rejects.toMatchObject({ code: 'AWARD_FREEZE_MISSED' });
  }
});
it('eşzamanlı iki yönetici seçimi tek ödül ve tek audit üretir; sahibi dışı yayın kararı 404', async () => {
  const w = await fixture();
  await point(w.owner, '2025-10-01T00:00:00Z');
  await freezeDueAwardCycles(db, FREEZE);
  const values = await Promise.allSettled(
    Array.from({ length: 2 }, () =>
      selectYearAlumnus(deps(FREEZE), w.admin, {
        ...w.key,
        userId: w.owner,
        reason: 'Örnek katkı',
      }),
    ),
  );
  expect(values.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(values.filter((x) => x.status === 'rejected')).toHaveLength(1);
  const a = await db.award.findFirstOrThrow({
    where: { userId: w.owner },
    omit: { verificationCode: false },
  });
  expect(a.verificationCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(await db.adminAuditLog.count({ where: { targetId: a.id, action: 'AWARD_SELECT' } })).toBe(
    1,
  );
  await expect(
    setAwardPublication(deps(), w.other, { awardId: a.id, public: true }),
  ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  expect(await publicAward(db, a.verificationCode)).toBeNull();
  expect(await publicAward(db, 'x'.repeat(43))).toBeNull();
  await setAwardPublication(deps(), w.owner, { awardId: a.id, public: true });
  expect(Object.keys((await publicAward(db, a.verificationCode))!).sort()).toEqual([
    'award',
    'department',
    'name',
    'university',
    'year',
  ]);
  await setAwardPublication(deps(), w.owner, { awardId: a.id, public: false });
  expect(await publicAward(db, a.verificationCode)).toBeNull();
});
it('dondurmadan sonra doğrulanan şüphe eski puanla adayı yeniden açmaz; yalnız yeniden hesaplama açar', async () => {
  const w = await fixture(),
    p = await point(w.owner, '2025-10-01T00:00:00Z');
  await freezeDueAwardCycles(db, FREEZE);
  const flag = await db.suspicionFlag.create({
    data: {
      userId: w.owner,
      rule: 'BURST',
      evidenceKey: randomUUID(),
      entryIds: [p.id],
      windowStart: BEFORE,
      windowEnd: FREEZE,
      entryCount: 1,
      points: 10,
    },
  });
  expect(
    (await listAwardCandidates(deps(FREEZE), w.admin, w.key)).candidates.some(
      (x) => x.userId === w.owner,
    ),
  ).toBe(false);
  const later = new Date(+FREEZE + 60_000);
  await decideSuspicion(deps(later), w.admin, {
    flagId: flag.id,
    decision: 'CONFIRM',
    reason: 'Sahte kayıt doğrulandı',
  });
  expect((await db.pointEntry.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('REVOKED');
  expect(
    (await listAwardCandidates(deps(later), w.admin, w.key)).candidates.some(
      (x) => x.userId === w.owner,
    ),
  ).toBe(false);
  await recalculateAwardCycle(deps(new Date(+FREEZE + 90_000)), w.admin, {
    ...w.key,
    reason: 'Doğrulanan şüphe sonrası',
  });
  expect(
    (await listAwardCandidates(deps(new Date(+FREEZE + 90_000)), w.admin, w.key)).candidates.find(
      (x) => x.userId === w.owner,
    )?.points,
  ).toBe(0);
});
it('ödül sonrası doğrulanan şüphe uyarı ve tek audit üretir; ödül/yayın otomatik kalkmaz', async () => {
  const w = await fixture(),
    p = await point(w.owner, '2025-10-01T00:00:00Z');
  await freezeDueAwardCycles(db, FREEZE);
  const { awardId } = await selectYearAlumnus(deps(FREEZE), w.admin, {
    ...w.key,
    userId: w.owner,
    reason: 'Örnek katkı',
  });
  await setAwardPublication(deps(FREEZE), w.owner, { awardId, public: true });
  const a = await db.award.findUniqueOrThrow({
    where: { id: awardId },
    omit: { verificationCode: false },
  });
  const flag = await db.suspicionFlag.create({
    data: {
      userId: w.owner,
      rule: 'BURST',
      evidenceKey: randomUUID(),
      entryIds: [p.id],
      windowStart: BEFORE,
      windowEnd: FREEZE,
      entryCount: 1,
      points: 10,
    },
  });
  const later = new Date(+FREEZE + 60_000);
  await decideSuspicion(deps(later), w.admin, {
    flagId: flag.id,
    decision: 'CONFIRM',
    reason: 'Sahte katkı doğrulandı',
  });
  for (let i = 0; i < 2; i++) {
    const v = await listAwardCandidates(deps(later), w.admin, w.key);
    expect(v.selectedUserId).toBe(w.owner);
    expect(v.selectedNeedsReview).toBe(true);
  }
  expect(
    await db.award.findUniqueOrThrow({ where: { id: awardId }, omit: { verificationCode: false } }),
  ).toEqual(a);
  expect(await publicAward(db, a.verificationCode)).not.toBeNull();
  expect(
    await db.adminAuditLog.count({ where: { targetId: awardId, action: 'AWARD_REVIEW_REQUIRED' } }),
  ).toBe(1);
  const cycle = await db.awardCycle.findUniqueOrThrow({ where: { departmentId_year: w.key } });
  expect(
    (
      await db.awardCandidate.findUniqueOrThrow({
        where: { cycleId_userId: { cycleId: cycle.id, userId: w.owner } },
      })
    ).points,
  ).toBe(10);
  const v = await recalculateAwardCycle(deps(new Date(+FREEZE + 90_000)), w.admin, {
    ...w.key,
    reason: 'Geçerli puanları yeniden incele',
  });
  expect(v.selectedNeedsReview).toBe(true);
  expect(v.selectedUserId).toBe(w.owner);
  expect(v.candidates.find((c) => c.userId === w.owner)?.points).toBe(0);
  expect(
    await db.adminAuditLog.count({ where: { targetId: awardId, action: 'AWARD_REVIEW_REQUIRED' } }),
  ).toBe(1);
});
it('doğrulama kotası 59 sonrası eşzamanlı dört istekte yalnız birini kabul eder; pencere tam sınırda açılır', async () => {
  const { consumeRateLimit, rateLimitKey } = await import('../auth/rate-limit');
  const key = rateLimitKey('award-verification', randomUUID(), 'fake-review-secret');
  const t = new Date('2100-01-01T00:00:00Z'),
    rule = { max: 60, windowSeconds: 60 };
  for (let i = 0; i < 59; i++)
    expect((await consumeRateLimit(db, key, rule, t)).allowed).toBe(true);
  expect(
    (await Promise.all(Array.from({ length: 4 }, () => consumeRateLimit(db, key, rule, t)))).filter(
      (x) => x.allowed,
    ),
  ).toHaveLength(1);
  expect((await consumeRateLimit(db, key, rule, new Date(+t + 59_999))).allowed).toBe(false);
  expect((await consumeRateLimit(db, key, rule, new Date(+t + 60_000))).allowed).toBe(true);
});
