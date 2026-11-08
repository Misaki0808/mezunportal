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
