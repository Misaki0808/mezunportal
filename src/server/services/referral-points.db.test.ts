import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { createInstitution, createUser } from '@/test/fixtures';
import { awardReferralInTx, revokePendingReferralPoints } from './points';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

it('üçlü onay, aylık ikili tavan, kabul çarpanı ve bekleyen puanın geri alınması', async () => {
  const institution = await createInstitution(db);
  const alumnusId = await createUser(db);
  const studentId = await createUser(db);
  for (const [action, points] of [
    ['REFERRAL_GIVEN', 20],
    ['REFERRAL_ACCEPTED', 30],
  ] as const) {
    await db.pointRule.upsert({
      where: { action },
      create: { action, points, delayDays: 14, isActive: true },
      update: { points, delayDays: 14, isActive: true },
    });
  }
  const now = new Date('2026-06-01T12:00:00Z');
  const base = {
    alumnusId,
    studentId,
    departmentIdAtWrite: institution.deptA1,
    organizationName: 'Kurum',
  };
  const claim = await db.referralClaim.create({ data: base });
  const award = (id: string, stage: 'REFERRAL' | 'ACCEPTANCE') =>
    db.$transaction((tx) => awardReferralInTx(tx, id, stage, now));
  expect(await award(claim.id, 'REFERRAL')).toBeNull();
  await db.referralClaim.update({
    where: { id: claim.id },
    data: {
      status: 'APPROVED',
      studentConfirmedAt: now,
      approvedAt: now,
    },
  });
  expect((await award(claim.id, 'REFERRAL'))?.created).toBe(true);
  expect((await award(claim.id, 'REFERRAL'))?.created).toBe(false);
  const second = await db.referralClaim.create({
    data: {
      ...base,
      status: 'APPROVED',
      studentConfirmedAt: now,
      approvedAt: now,
    },
  });
  await award(second.id, 'REFERRAL');
  await db.referralClaim.update({
    where: { id: second.id },
    data: {
      status: 'ACCEPTED_APPROVED',
      acceptanceProposedAt: now,
      alumniConfirmedAt: now,
      acceptanceApprovedAt: now,
    },
  });
  await award(second.id, 'ACCEPTANCE');
  const entries = await db.pointEntry.findMany({
    where: { sourceType: 'REFERRAL', sourceId: { in: [claim.id, second.id] } },
  });
  expect(entries.find((e) => e.sourceId === claim.id)).toMatchObject({
    points: 20,
    status: 'PENDING',
  });
  expect(entries.filter((e) => e.sourceId === second.id).map((e) => e.multiplierPercent)).toEqual([
    0, 0,
  ]);
  await db.$transaction((tx) => revokePendingReferralPoints(tx, claim.id, now));
  expect(await db.pointEntry.findFirst({ where: { sourceId: claim.id } })).toMatchObject({
    status: 'REVOKED',
    revokedReason: 'REFERRAL_CANCELLED',
  });
});

it('şüphe taraması sıfır çarpanlı tekrarları da işaretler ve aynı kanıtı iki kez açmaz', async () => {
  const institution = await createInstitution(db);
  const alumnusId = await createUser(db);
  const students = [await createUser(db), await createUser(db), await createUser(db)];
  const now = new Date();
  await db.pointRule.upsert({
    where: { action: 'REFERRAL_GIVEN' },
    create: { action: 'REFERRAL_GIVEN', points: 20, delayDays: 14, isActive: true },
    update: { points: 20, delayDays: 14, isActive: true },
  });
  for (const studentId of [students[0]!, students[0]!, students[0]!, students[1]!, students[2]!]) {
    const claim = await db.referralClaim.create({
      data: {
        alumnusId,
        studentId,
        departmentIdAtWrite: institution.deptA1,
        organizationName: 'Kurum',
        status: 'APPROVED',
        studentConfirmedAt: now,
        approvedAt: now,
      },
    });
    await db.$transaction((tx) => awardReferralInTx(tx, claim.id, 'REFERRAL', now));
  }
  expect(
    await db.pointEntry.count({
      where: { userId: alumnusId, action: 'REFERRAL_GIVEN', multiplierPercent: 0 },
    }),
  ).toBe(2);
  const { runSuspicionScan } = await import('./points-scan');
  await runSuspicionScan({ db, now: () => now });
  await runSuspicionScan({ db, now: () => now });
  const flags = await db.suspicionFlag.findMany({
    where: { userId: alumnusId, rule: { in: ['REFERRAL_REPEAT', 'REFERRAL_BURST'] } },
    orderBy: { rule: 'asc' },
  });
  expect(flags.map((f) => f.rule).sort()).toEqual(['REFERRAL_BURST', 'REFERRAL_REPEAT']);
  expect(flags.find((f) => f.rule === 'REFERRAL_REPEAT')?.entryCount).toBe(3);
  expect(flags.every((f) => f.recurrenceCount === 0)).toBe(true);
});

it('referans ve kabul geri doldurması tekrarlanabilir; iptal edilen iddia yeniden puanlanmaz', async () => {
  const institution = await createInstitution(db);
  const alumnusId = await createUser(db);
  const studentId = await createUser(db);
  const now = new Date('2100-04-15T12:00:00.000Z');
  for (const [action, points] of [
    ['REFERRAL_GIVEN', 20],
    ['REFERRAL_ACCEPTED', 30],
  ] as const)
    await db.pointRule.upsert({
      where: { action },
      create: { action, points, delayDays: 14, isActive: true },
      update: { points, delayDays: 14, isActive: true },
    });
  const claim = await db.referralClaim.create({
    data: {
      alumnusId,
      studentId,
      departmentIdAtWrite: institution.deptA1,
      organizationName: 'Kurum',
      status: 'ACCEPTED_APPROVED',
      studentConfirmedAt: now,
      approvedAt: now,
      acceptanceProposedAt: now,
      alumniConfirmedAt: now,
      acceptanceApprovedAt: now,
    },
  });
  const { runPointBackfill } = await import('./points');
  const deps = { db, now: () => now };
  await runPointBackfill(deps, { since: now });
  await runPointBackfill(deps, { since: now });
  const entries = await db.pointEntry.findMany({
    where: { sourceType: 'REFERRAL', sourceId: claim.id },
  });
  expect(entries.map((entry) => entry.points).sort((a, b) => a - b)).toEqual([20, 30]);
  await db.referralClaim.update({
    where: { id: claim.id },
    data: { status: 'CANCELLED', cancelledAt: now },
  });
  await db.$transaction((tx) => revokePendingReferralPoints(tx, claim.id, now));
  await runPointBackfill(deps, { since: now });
  expect(await db.pointEntry.count({ where: { sourceId: claim.id, status: 'REVOKED' } })).toBe(2);
});
