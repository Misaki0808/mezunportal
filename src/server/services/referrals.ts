import 'server-only';

import {
  listReferralCandidatesSchema,
  listReferralsSchema,
  referralPageSchema,
  type ReferralPage,
  referralIdSchema,
  respondReferralSchema,
  proposeReferralAcceptanceSchema,
  reviewReferralSchema,
  proposeReferralSchema,
  type ProposeReferralInput,
  type ReferralCandidates,
  type ReferralResult,
} from '@/contracts/referrals';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { codedConflict, codedForbidden, codedNotFound } from '@/lib/errors';
import { createPermissions } from '../permissions/guards';
import type { Actor } from '../permissions/actor';
import { visibleJobPostingIds } from '../repositories/job-postings';
import { requireConsent } from './privacy';
import { stageNotification } from './notification-intent';
import { covers, loadAnyAdmin, readAsAdmin, idCursorWhere, toPage } from './admin-access';
import { recordAdminAction } from './audit';
import { awardReferralInTx, revokePendingReferralPoints } from './points';

export type ReferralDeps = { db: PrismaClient; now?: () => Date };
type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

async function alumniActor(tx: Tx, userId: string, now: Date): Promise<Actor> {
  const actor = await createPermissions({
    db: () => tx,
    getSessionUserId: async () => userId,
    now: () => now,
  }).requireVerifiedMember({ roles: ['ALUMNI'] });
  await requireConsent(tx, userId);
  return actor;
}

/** Yalnız mevcut onaylı iletişim veya tamamlanmış görüşme üzerinden tanınan öğrenciler. */
async function eligibleStudents(tx: Tx, actor: Actor, now: Date, studentId?: string) {
  const departmentIds = actor.facts.memberships
    .filter((m) => m.role === 'ALUMNI' && m.endedAt === null && m.verificationStatus === 'VERIFIED')
    .map((m) => m.departmentId);
  const departments = await tx.department.findMany({
    where: { id: { in: departmentIds } },
    select: { faculty: { select: { universityId: true } } },
  });
  const universityIds = [...new Set(departments.map((d) => d.faculty.universityId))];
  const contacts = await tx.contactRequest.findMany({
    where: { status: 'APPROVED', OR: [{ requesterId: actor.userId }, { targetId: actor.userId }] },
    select: { requesterId: true, targetId: true },
  });
  const appointments = await tx.appointment.findMany({
    where: { status: 'COMPLETED', OR: [{ mentorId: actor.userId }, { menteeId: actor.userId }] },
    select: { mentorId: true, menteeId: true },
  });
  const ids = new Set([
    ...contacts.map((c) => (c.requesterId === actor.userId ? c.targetId : c.requesterId)),
    ...appointments.map((a) => (a.mentorId === actor.userId ? a.menteeId : a.mentorId)),
  ]);
  if (studentId && !ids.has(studentId)) return [];
  const memberships = await tx.membership.findMany({
    where: {
      userId: studentId ?? { in: [...ids] },
      role: 'STUDENT',
      verificationStatus: 'VERIFIED',
      endedAt: null,
      department: { faculty: { universityId: { in: universityIds } } },
      user: { deletedAt: null, OR: [{ banned: false }, { banExpires: { lte: now } }] },
    },
    select: {
      userId: true,
      departmentId: true,
      user: { select: { name: true } },
      department: { select: { name: true } },
    },
    orderBy: [{ userId: 'asc' }, { departmentId: 'asc' }],
  });
  return memberships.filter(
    (row, index) => memberships.findIndex((m) => m.userId === row.userId) === index,
  );
}

export async function listReferralCandidates(
  deps: ReferralDeps,
  userId: string,
  input: unknown,
): Promise<ReferralCandidates> {
  listReferralCandidatesSchema.parse(input);
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.$transaction(async (tx) => {
    const actor = await alumniActor(tx, userId, now);
    const rows = await eligibleStudents(tx, actor, now);
    return {
      students: rows.map((r) => ({
        id: r.userId,
        name: r.user.name,
        departmentName: r.department.name,
      })),
    };
  }, TX_OPTIONS);
}

export async function proposeReferral(
  deps: ReferralDeps,
  userId: string,
  input: ProposeReferralInput,
): Promise<ReferralResult> {
  const parsed = proposeReferralSchema.parse(input);
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.$transaction(async (tx) => {
    // Hesap silmeyle sıralama: katılımcılar her zaman aynı sırada kilitlenir.
    for (const id of [...new Set([userId, parsed.studentId])].sort())
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${id} FOR SHARE`;
    const actor = await alumniActor(tx, userId, now);
    // İlişki geri çekme/iptal ile yarışmasın: kontrol ve beyan yazımı boyunca aynı satırlar kilitli.
    await tx.$queryRaw`SELECT "id" FROM "ContactRequest" WHERE ("requesterId"=${userId} AND "targetId"=${parsed.studentId}) OR ("requesterId"=${parsed.studentId} AND "targetId"=${userId}) ORDER BY "id" FOR SHARE`;
    await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE ("mentorId"=${userId} AND "menteeId"=${parsed.studentId}) OR ("mentorId"=${parsed.studentId} AND "menteeId"=${userId}) ORDER BY "id" FOR SHARE`;
    const student = (await eligibleStudents(tx, actor, now, parsed.studentId))[0];
    if (!student) throw codedForbidden('REFERRAL_NOT_ELIGIBLE');
    let organizationName = parsed.organizationName ?? null;
    if (parsed.jobPostingId) {
      if (!(await visibleJobPostingIds(tx, [parsed.jobPostingId], now)).length)
        throw codedNotFound('RESOURCE_NOT_FOUND');
      const posting = await tx.jobPosting.findFirst({
        where: {
          id: parsed.jobPostingId,
          targets: { some: { departmentId: student.departmentId } },
          status: 'PUBLISHED',
        },
        select: { organizationName: true },
      });
      if (!posting) throw codedNotFound('RESOURCE_NOT_FOUND');
      organizationName = posting.organizationName;
    }
    const claim = await tx.referralClaim.create({
      data: {
        alumnusId: userId,
        studentId: student.userId,
        departmentIdAtWrite: student.departmentId,
        jobPostingId: parsed.jobPostingId ?? null,
        organizationName,
        note: parsed.note ?? null,
      },
    });
    await stageNotification(tx, student.userId, {
      type: 'generic',
      event: 'referralUpdated',
      eventId: `${claim.id}:PROPOSED`,
      path: '/hesap/referanslar',
    });
    return { referralId: claim.id, status: claim.status };
  }, TX_OPTIONS);
}

async function lockedClaim(tx: Tx, referralId: string, actorId: string) {
  const initial = await tx.referralClaim.findUnique({
    where: { id: referralId },
    select: { alumnusId: true, studentId: true },
  });
  if (!initial) throw codedNotFound('RESOURCE_NOT_FOUND');
  for (const id of [...new Set([actorId, initial.alumnusId, initial.studentId])].sort())
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${id} FOR SHARE`;
  await tx.$queryRaw`SELECT "id" FROM "ReferralClaim" WHERE "id"=${referralId} FOR UPDATE`;
  const claim = await tx.referralClaim.findUnique({ where: { id: referralId } });
  if (!claim) throw codedNotFound('RESOURCE_NOT_FOUND');
  return claim;
}

async function participant(tx: Tx, userId: string, role: 'ALUMNI' | 'STUDENT', now: Date) {
  const actor = await createPermissions({
    db: () => tx,
    getSessionUserId: async () => userId,
    now: () => now,
  }).requireVerifiedMember({ roles: [role] });
  await requireConsent(tx, userId);
  return actor;
}
async function notify(tx: Tx, userId: string, id: string, status: string) {
  await stageNotification(tx, userId, {
    type: 'generic',
    event: 'referralUpdated',
    eventId: `${id}:${status}`,
    path: '/hesap/referanslar',
  });
}

export async function respondReferral(
  deps: ReferralDeps,
  userId: string,
  input: unknown,
): Promise<ReferralResult> {
  const parsed = respondReferralSchema.parse(input);
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.$transaction(async (tx) => {
    const row = await lockedClaim(tx, parsed.referralId, userId);
    await participant(tx, userId, 'STUDENT', now);
    if (row.studentId !== userId) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (row.status !== 'PROPOSED') throw codedConflict('REFERRAL_INVALID_STATE');
    const status = parsed.decision === 'CONFIRM' ? 'STUDENT_CONFIRMED' : 'REJECTED';
    await tx.referralClaim.update({
      where: { id: row.id },
      data: { status, studentConfirmedAt: status === 'STUDENT_CONFIRMED' ? now : null },
    });
    await notify(tx, row.alumnusId, row.id, status);
    return { referralId: row.id, status };
  }, TX_OPTIONS);
}

export async function proposeReferralAcceptance(
  deps: ReferralDeps,
  userId: string,
  input: unknown,
): Promise<ReferralResult> {
  const parsed = proposeReferralAcceptanceSchema.parse(input);
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.$transaction(async (tx) => {
    const row = await lockedClaim(tx, parsed.referralId, userId);
    await participant(tx, userId, 'STUDENT', now);
    if (row.studentId !== userId) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (row.status !== 'APPROVED') throw codedConflict('REFERRAL_INVALID_STATE');
    const status = 'ACCEPTED_PROPOSED' as const;
    await tx.referralClaim.update({
      where: { id: row.id },
      data: { status, acceptanceProposedAt: now, acceptanceNote: parsed.note ?? null },
    });
    await notify(tx, row.alumnusId, row.id, status);
    return { referralId: row.id, status };
  }, TX_OPTIONS);
}

export async function respondReferralAcceptance(
  deps: ReferralDeps,
  userId: string,
  input: unknown,
): Promise<ReferralResult> {
  const parsed = respondReferralSchema.parse(input);
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.$transaction(async (tx) => {
    const row = await lockedClaim(tx, parsed.referralId, userId);
    await participant(tx, userId, 'ALUMNI', now);
    if (row.alumnusId !== userId) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (row.status !== 'ACCEPTED_PROPOSED') throw codedConflict('REFERRAL_INVALID_STATE');
    const status =
      parsed.decision === 'CONFIRM' ? 'ACCEPTED_ALUMNI_CONFIRMED' : 'ACCEPTED_REJECTED';
    await tx.referralClaim.update({
      where: { id: row.id },
      data: { status, alumniConfirmedAt: parsed.decision === 'CONFIRM' ? now : null },
    });
    await notify(tx, row.studentId, row.id, status);
    return { referralId: row.id, status };
  }, TX_OPTIONS);
}

export async function reviewReferral(
  deps: ReferralDeps,
  userId: string,
  input: unknown,
): Promise<ReferralResult> {
  const parsed = reviewReferralSchema.parse(input);
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.$transaction(async (tx) => {
    const row = await lockedClaim(tx, parsed.referralId, userId);
    const admin = await loadAnyAdmin(tx, userId, now);
    if (userId === row.alumnusId || userId === row.studentId)
      throw codedForbidden('AUTH_FORBIDDEN');
    if (!(await covers(tx, admin, row.departmentIdAtWrite))) throw codedForbidden('AUTH_FORBIDDEN');
    if (
      row.status !==
      (parsed.stage === 'REFERRAL' ? 'STUDENT_CONFIRMED' : 'ACCEPTED_ALUMNI_CONFIRMED')
    )
      throw codedConflict('REFERRAL_INVALID_STATE');
    const approve = parsed.decision === 'APPROVE';
    const status =
      parsed.stage === 'REFERRAL'
        ? approve
          ? 'APPROVED'
          : 'REJECTED'
        : approve
          ? 'ACCEPTED_APPROVED'
          : 'ACCEPTED_REJECTED';
    await recordAdminAction(tx, {
      actor: admin,
      action: approve ? 'MODERATION_PUBLISH' : 'MODERATION_REJECT',
      targetType: 'REFERRAL',
      targetId: row.id,
      reason: parsed.reason,
      metadata: { departmentId: row.departmentIdAtWrite, stage: parsed.stage },
    });
    await tx.referralClaim.update({
      where: { id: row.id },
      data:
        parsed.stage === 'REFERRAL'
          ? {
              status,
              reviewedById: userId,
              reviewedAt: now,
              decisionReason: parsed.reason ?? null,
              approvedAt: approve ? now : null,
            }
          : {
              status,
              acceptanceReviewedById: userId,
              acceptanceReviewedAt: now,
              acceptanceReason: parsed.reason ?? null,
              acceptanceApprovedAt: approve ? now : null,
            },
    });
    if (approve) await awardReferralInTx(tx, row.id, parsed.stage, now);
    await notify(tx, row.alumnusId, row.id, status);
    await notify(tx, row.studentId, row.id, status);
    return { referralId: row.id, status };
  }, TX_OPTIONS);
}

export async function cancelReferral(
  deps: ReferralDeps,
  userId: string,
  input: unknown,
): Promise<ReferralResult> {
  const { referralId } = referralIdSchema.parse(input);
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.$transaction(async (tx) => {
    const row = await lockedClaim(tx, referralId, userId);
    await participant(tx, userId, 'ALUMNI', now);
    if (row.alumnusId !== userId) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (['CANCELLED', 'REJECTED'].includes(row.status))
      throw codedConflict('REFERRAL_INVALID_STATE');
    if (row.approvedAt && now.getTime() >= row.approvedAt.getTime() + 14 * 86400000)
      throw codedConflict('REFERRAL_CANCEL_WINDOW_CLOSED');
    await tx.referralClaim.update({
      where: { id: row.id },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
    await revokePendingReferralPoints(tx, row.id, now);
    await notify(tx, row.studentId, row.id, 'CANCELLED');
    return { referralId: row.id, status: 'CANCELLED' };
  }, TX_OPTIONS);
}

const REFERRAL_SELECT = {
  id: true,
  status: true,
  organizationName: true,
  jobPostingId: true,
  note: true,
  acceptanceNote: true,
  decisionReason: true,
  acceptanceReason: true,
  createdAt: true,
  studentConfirmedAt: true,
  approvedAt: true,
  acceptanceProposedAt: true,
  alumniConfirmedAt: true,
  acceptanceApprovedAt: true,
  alumnus: { select: { id: true, name: true } },
  student: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
} satisfies Prisma.ReferralClaimSelect;

export async function listMyReferrals(
  deps: ReferralDeps,
  userId: string,
  input: unknown,
): Promise<ReferralPage> {
  const parsed = listReferralsSchema.parse(input);
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.$transaction(async (tx) => {
    await createPermissions({
      db: () => tx,
      getSessionUserId: async () => userId,
      now: () => now,
    }).requireVerifiedMember();
    await requireConsent(tx, userId);
    const rows = await tx.referralClaim.findMany({
      where: {
        OR: [{ alumnusId: userId }, { studentId: userId }],
        ...(parsed.status ? { status: parsed.status } : {}),
        ...idCursorWhere(parsed.cursor),
      },
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
      select: REFERRAL_SELECT,
    });
    return referralPageSchema.parse(toPage(rows, parsed.limit));
  }, TX_OPTIONS);
}

export async function listReferralModeration(
  deps: ReferralDeps,
  userId: string,
  input: unknown,
): Promise<ReferralPage> {
  const parsed = listReferralsSchema.parse(input);
  return readAsAdmin(deps, userId, 'ANY_ADMIN', async ({ tx, departmentIds }) => {
    const rows = await tx.referralClaim.findMany({
      where: {
        departmentIdAtWrite: { in: departmentIds },
        status: parsed.status ?? { in: ['STUDENT_CONFIRMED', 'ACCEPTED_ALUMNI_CONFIRMED'] },
        ...idCursorWhere(parsed.cursor),
      },
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
      select: REFERRAL_SELECT,
    });
    return referralPageSchema.parse(toPage(rows, parsed.limit));
  });
}
