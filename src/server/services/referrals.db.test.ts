import { afterAll, expect, it } from 'vitest';
import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { deleteAccount } from './accountDeletion';
import { awardReferralInTx } from './points';
import { buildDataExport } from './dataExport';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import {
  listReferralCandidates,
  proposeReferral,
  respondReferral,
  reviewReferral,
  proposeReferralAcceptance,
  respondReferralAcceptance,
  cancelReferral,
  listReferralModeration,
} from './referrals';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

it('yalnız onaylı iletişimdeki doğrulanmış ve aynı üniversitedeki öğrenci seçilebilir; doğrudan çağrı da denetlenir', async () => {
  const institution = await createInstitution(db);
  const foreign = await createInstitution(db);
  const alumnus = await createUser(db);
  const student = await createUser(db);
  const unrelated = await createUser(db);
  const outside = await createUser(db);
  await addMembership(db, {
    userId: alumnus,
    departmentId: institution.deptA1,
    role: 'ALUMNI',
    status: 'VERIFIED',
    graduationYear: 2020,
  });
  for (const [userId, departmentId] of [
    [student, institution.deptA1],
    [unrelated, institution.deptA1],
    [outside, foreign.deptA1],
  ] as const) {
    await addMembership(db, {
      userId,
      departmentId,
      role: 'STUDENT',
      status: 'VERIFIED',
      entryYear: 2024,
    });
  }
  await grantRequiredConsents(db, alumnus);
  await db.contactRequest.createMany({
    data: [
      {
        requesterId: student,
        targetId: alumnus,
        status: 'APPROVED',
        fields: ['EMAIL'],
        decidedAt: new Date(),
      },
      {
        requesterId: outside,
        targetId: alumnus,
        status: 'APPROVED',
        fields: ['EMAIL'],
        decidedAt: new Date(),
      },
      { requesterId: unrelated, targetId: alumnus, status: 'PENDING', fields: ['EMAIL'] },
    ],
  });
  expect((await listReferralCandidates({ db }, alumnus, {})).students.map((x) => x.id)).toEqual([
    student,
  ]);
  const failure = await proposeReferral({ db }, alumnus, {
    studentId: unrelated,
    organizationName: 'Kurum',
  }).catch((e: unknown) => e);
  expect(isCodedError(failure) && failure.code).toBe('REFERRAL_NOT_ELIGIBLE');
  const result = await proposeReferral({ db }, alumnus, {
    studentId: student,
    organizationName: 'Kurum',
  });
  expect(result.status).toBe('PROPOSED');
  await grantRequiredConsents(db, student);
  const denied = await respondReferral({ db }, student, {
    referralId: result.referralId,
    decision: 'REJECT',
  });
  expect(denied.status).toBe('REJECTED');
  expect(
    await db.referralClaim.findUniqueOrThrow({ where: { id: result.referralId } }),
  ).toMatchObject({ decisionReason: null, approvedAt: null });
  expect(await db.pointEntry.count({ where: { sourceId: result.referralId } })).toBe(0);
  await db.contactRequest.updateMany({
    where: { requesterId: student, targetId: alumnus },
    data: { status: 'REVOKED', closedAt: new Date() },
  });
  const afterRevocation = await proposeReferral({ db }, alumnus, {
    studentId: student,
    organizationName: 'Kurum',
  }).catch((e: unknown) => e);
  expect(isCodedError(afterRevocation) && afterRevocation.code).toBe('REFERRAL_NOT_ELIGIBLE');
});

it('üçlü onay ve kabul sırasını, yönetici kapsamını ve iptalde puan geri almayı zorlar', async () => {
  const inst = await createInstitution(db);
  const alumni = await createUser(db);
  const student = await createUser(db);
  const admin = await createUser(db);
  const outsider = await createUser(db);
  await addMembership(db, {
    userId: alumni,
    departmentId: inst.deptA1,
    role: 'ALUMNI',
    status: 'VERIFIED',
    graduationYear: 2020,
  });
  await addMembership(db, {
    userId: student,
    departmentId: inst.deptA1,
    role: 'STUDENT',
    status: 'VERIFIED',
    entryYear: 2024,
  });
  await addMembership(db, {
    userId: admin,
    departmentId: inst.deptA1,
    role: 'ACADEMIC',
    status: 'VERIFIED',
  });
  await addMembership(db, {
    userId: outsider,
    departmentId: inst.deptB1,
    role: 'ACADEMIC',
    status: 'VERIFIED',
  });
  await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  await addGrant(db, { userId: outsider, scope: 'DEPARTMENT', departmentId: inst.deptB1 });
  for (const id of [alumni, student, admin, outsider]) await grantRequiredConsents(db, id);
  for (const [action, points] of [
    ['REFERRAL_GIVEN', 20],
    ['REFERRAL_ACCEPTED', 30],
  ] as const)
    await db.pointRule.upsert({
      where: { action },
      create: { action, points, delayDays: 14, isActive: true },
      update: { points, delayDays: 14, isActive: true },
    });
  await db.contactRequest.create({
    data: {
      requesterId: student,
      targetId: alumni,
      status: 'APPROVED',
      fields: ['EMAIL'],
      decidedAt: new Date(),
    },
  });
  const now = new Date();
  const deps = { db, now: () => now };
  const claim = await proposeReferral(deps, alumni, {
    studentId: student,
    organizationName: 'Kurum',
  });
  const review = {
    referralId: claim.referralId,
    stage: 'REFERRAL' as const,
    decision: 'APPROVE' as const,
  };
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return isCodedError(e) ? e.code : 'unexpected';
    }
  };
  expect(await code(reviewReferral(deps, admin, review))).toBe('REFERRAL_INVALID_STATE');
  expect(await db.pointEntry.count({ where: { sourceId: claim.referralId } })).toBe(0);
  await respondReferral(deps, student, { referralId: claim.referralId, decision: 'CONFIRM' });
  expect((await listReferralModeration(deps, outsider, {})).items).toHaveLength(0);
  expect(await code(reviewReferral(deps, outsider, review))).toBe('AUTH_FORBIDDEN');
  await reviewReferral(deps, admin, review);
  expect(await db.pointEntry.findFirst({ where: { sourceId: claim.referralId } })).toMatchObject({
    points: 20,
    status: 'PENDING',
  });
  await proposeReferralAcceptance(deps, student, { referralId: claim.referralId });
  expect(await code(reviewReferral(deps, admin, { ...review, stage: 'ACCEPTANCE' }))).toBe(
    'REFERRAL_INVALID_STATE',
  );
  await respondReferralAcceptance(deps, alumni, {
    referralId: claim.referralId,
    decision: 'CONFIRM',
  });
  await reviewReferral(deps, admin, { ...review, stage: 'ACCEPTANCE' });
  expect(
    await db.pointEntry.count({ where: { sourceId: claim.referralId, status: 'PENDING' } }),
  ).toBe(2);
  expect(
    await db.adminAuditLog.count({ where: { targetType: 'REFERRAL', targetId: claim.referralId } }),
  ).toBe(2);
  await cancelReferral(deps, alumni, { referralId: claim.referralId });
  expect(
    await db.pointEntry.count({ where: { sourceId: claim.referralId, status: 'REVOKED' } }),
  ).toBe(2);
  expect(
    await db.notificationIntent.count({ where: { key: { contains: claim.referralId } } }),
  ).toBeGreaterThan(3);
});

it('döküm yalnız katıldığı referansları verir; hesap silmede not ve bekleyen puan kaldırılır', async () => {
  const inst = await createInstitution(db);
  const alumni = await createUser(db);
  const student = await createUser(db);
  const stranger = await createUser(db);
  const approved = new Date();
  const claim = await db.referralClaim.create({
    data: {
      alumnusId: alumni,
      studentId: student,
      departmentIdAtWrite: inst.deptA1,
      organizationName: 'Kurum',
      note: 'Özel not',
      status: 'APPROVED',
      studentConfirmedAt: approved,
      approvedAt: approved,
    },
  });
  await db.pointRule.upsert({
    where: { action: 'REFERRAL_GIVEN' },
    create: { action: 'REFERRAL_GIVEN', points: 20, delayDays: 14, isActive: true },
    update: { points: 20, delayDays: 14, isActive: true },
  });
  await db.$transaction((tx) => awardReferralInTx(tx, claim.id, 'REFERRAL', approved));
  expect((await buildDataExport(db, student)).referrals).toMatchObject([
    { id: claim.id, role: 'STUDENT', note: 'Özel not' },
  ]);
  expect((await buildDataExport(db, stranger)).referrals).toEqual([]);
  const user = await db.user.findUniqueOrThrow({ where: { id: student }, select: { email: true } });
  await deleteAccount(
    db,
    student,
    { publishedContent: 'DELETE', confirmEmail: user.email },
    { removeStoredFiles: null },
  );
  expect(await db.referralClaim.findUnique({ where: { id: claim.id } })).toBeNull();
  expect(await db.pointEntry.findFirst({ where: { sourceId: claim.id } })).toMatchObject({
    status: 'REVOKED',
    counterpartId: null,
  });
});
