import 'server-only';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import {
  CV_REVIEW_EXPIRY_DAYS,
  type CvReviewAvailability,
  type CvReviewRequestView,
} from '@/contracts/cv-review-request';
import { codedConflict, codedForbidden, codedNotFound } from '@/lib/errors';
import type { StorageAdapter } from '../external/storage';
import { createPermissions } from '../permissions/guards';
import { emitEvent, subjectFromActor } from './event';
import { requireConsent } from './privacy';
import { visibleMentorWhere } from './mentor-directory';
import { viewerUniversityIds } from './search';
import { monthRange } from '../rules/appointmentSlots';
import { removeUploadFiles } from './cv-shared';
import { awardForCvReview, awardSafely } from './points';

type Db = Prisma.TransactionClient;
export type CvReviewDeps = {
  db: PrismaClient;
  storage: StorageAdapter;
  now?: () => Date;
  notify?: (
    userId: string,
    event: 'requested' | 'answered' | 'expired',
    id: string,
  ) => Promise<void>;
};
const nowOf = (deps: CvReviewDeps) => deps.now?.() ?? new Date();
async function lockUsers(tx: Db, ids: string[]) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join([...new Set(ids)])}) ORDER BY "id" FOR UPDATE`;
}
async function actor(tx: Db, id: string, now: Date, mentor = false) {
  const guards = createPermissions({
    db: () => tx,
    getSessionUserId: async () => id,
    now: () => now,
  });
  const user = mentor ? await guards.requireMentor() : await guards.requireVerifiedMember();
  await requireConsent(tx, id);
  return user;
}
const select = {
  id: true,
  studentId: true,
  mentorId: true,
  cvUploadId: true,
  status: true,
  note: true,
  comment: true,
  createdAt: true,
  expiresAt: true,
  answeredAt: true,
  helpfulAt: true,
  student: { select: { name: true } },
  mentor: { select: { name: true } },
} satisfies Prisma.CvReviewRequestSelect;
type Row = Prisma.CvReviewRequestGetPayload<{ select: typeof select }>;
function view(row: Row, userId: string, now: Date): CvReviewRequestView {
  const mentor = row.mentorId === userId;
  const open = row.status === 'OPEN' && row.expiresAt > now;
  return {
    id: row.id,
    status: row.status,
    role: mentor ? 'MENTOR' : 'STUDENT',
    counterpart: {
      userId: mentor ? row.studentId : row.mentorId,
      displayName: mentor ? row.student.name : row.mentor.name,
    },
    note: row.note,
    comment: row.comment,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    answeredAt: row.answeredAt,
    helpfulAt: row.helpfulAt,
    actions: {
      canAnswer: mentor && open,
      canViewCv: mentor && open,
      canMarkHelpful: !mentor && row.status === 'COMPLETED' && !row.helpfulAt,
    },
  };
}
async function availability(
  tx: Db,
  userId: string,
  mentorId: string,
  now: Date,
): Promise<CvReviewAvailability> {
  const person = await actor(tx, userId, now);
  if (
    !person.facts.memberships.some(
      (membership) =>
        membership.role === 'STUDENT' &&
        membership.verificationStatus === 'VERIFIED' &&
        membership.endedAt === null,
    )
  )
    throw codedForbidden('AUTH_FORBIDDEN');
  if (userId === mentorId) return { available: false, reason: 'SELF' };
  const universities = await viewerUniversityIds(tx, person);
  const mentor = await tx.mentorProfile.findFirst({
    where: { ...visibleMentorWhere(universities, userId, {}, now), userId: mentorId },
    select: { cvReviewEnabled: true, cvReviewMonthlyLimit: true },
  });
  if (!mentor) return { available: false, reason: 'NOT_MENTOR' };
  if (!mentor.cvReviewEnabled || mentor.cvReviewMonthlyLimit === 0)
    return { available: false, reason: 'DISABLED' };
  const { from, to } = monthRange(now);
  const count = await tx.cvReviewRequest.count({
    where: { mentorId, createdAt: { gte: from, lt: to } },
  });
  if (count >= mentor.cvReviewMonthlyLimit) return { available: false, reason: 'MONTHLY_LIMIT' };
  const open = await tx.cvReviewRequest.count({
    where: { studentId: userId, mentorId, status: 'OPEN' },
  });
  if (open) return { available: false, reason: 'OPEN_REQUEST_EXISTS' };
  const cv = await tx.cvUpload.findFirst({
    where: { userId, status: 'APPLIED', storageKey: { not: null } },
    orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  if (!cv) return { available: false, reason: 'NO_CV' };
  return { available: true, reason: null };
}
export async function getAvailability(deps: CvReviewDeps, userId: string, mentorId: string) {
  return deps.db.$transaction(async (tx) => availability(tx, userId, mentorId, nowOf(deps)));
}
export async function createRequest(
  deps: CvReviewDeps,
  userId: string,
  input: { mentorId: string; note: string },
) {
  const now = nowOf(deps);
  const { row, subject } = await deps.db.$transaction(async (tx) => {
    await lockUsers(tx, [userId, input.mentorId]);
    const person = await actor(tx, userId, now);
    const result = await availability(tx, userId, input.mentorId, now);
    if (!result.available) {
      if (result.reason === 'MONTHLY_LIMIT') throw codedConflict('CV_REVIEW_MONTHLY_LIMIT');
      if (result.reason === 'NO_CV') throw codedConflict('CV_REVIEW_NO_CV');
      if (result.reason === 'OPEN_REQUEST_EXISTS') throw codedConflict('CV_REVIEW_OPEN_EXISTS');
      throw codedForbidden('CV_REVIEW_UNAVAILABLE');
    }
    const cv = await tx.cvUpload.findFirstOrThrow({
      where: { userId, status: 'APPLIED', storageKey: { not: null } },
      orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    const row = await tx.cvReviewRequest.create({
      data: {
        studentId: userId,
        mentorId: input.mentorId,
        cvUploadId: cv.id,
        note: input.note,
        createdAt: now,
        expiresAt: new Date(now.getTime() + CV_REVIEW_EXPIRY_DAYS * 86400000),
      },
      select,
    });
    return { row, subject: subjectFromActor(person) };
  });
  // Metrik kişisel içerik taşımaz; olay yazımı iş sonucunu etkileyemez.
  emitEvent(deps.db, userId, { type: 'CV_REVIEW_REQUESTED', props: {} }, subject);
  await deps.notify?.(row.mentorId, 'requested', row.id).catch(() => undefined);
  return view(row, userId, now);
}
/** Kullanıcının son uygulanan CV'si korunur; başka açık talep varsa dosya tutulur. */
async function releaseOldFile(
  tx: Db,
  storage: StorageAdapter,
  row: { studentId: string; cvUploadId: string },
) {
  const latest = await tx.cvUpload.findFirst({
    where: { userId: row.studentId, status: 'APPLIED', storageKey: { not: null } },
    orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  if (latest?.id === row.cvUploadId) return;
  const upload = await tx.cvUpload.findUnique({
    where: { id: row.cvUploadId },
    select: { id: true, storageKey: true },
  });
  if (upload) await removeUploadFiles(tx, storage, [upload]);
}
export async function answerRequest(
  deps: CvReviewDeps,
  userId: string,
  input: { requestId: string; comment: string },
) {
  const now = nowOf(deps);
  const row = await deps.db.$transaction(
    async (tx) => {
      const ref = await tx.cvReviewRequest.findUnique({
        where: { id: input.requestId },
        select: { studentId: true, mentorId: true },
      });
      if (!ref || ref.mentorId !== userId) throw codedNotFound('RESOURCE_NOT_FOUND');
      await lockUsers(tx, [ref.studentId, ref.mentorId]);
      await actor(tx, userId, now, true);
      await tx.$queryRaw`SELECT "id" FROM "CvReviewRequest" WHERE "id" = ${input.requestId} FOR UPDATE`;
      const current = await tx.cvReviewRequest.findUniqueOrThrow({
        where: { id: input.requestId },
        select,
      });
      if (current.status !== 'OPEN' || current.expiresAt <= now)
        throw codedConflict('CV_REVIEW_CLOSED');
      const updated = await tx.cvReviewRequest.update({
        where: { id: current.id },
        data: { status: 'COMPLETED', comment: input.comment, answeredAt: now },
        select,
      });
      await releaseOldFile(tx, deps.storage, updated);
      return updated;
    },
    { timeout: 30000 },
  );
  await deps.notify?.(row.studentId, 'answered', row.id).catch(() => undefined);
  return view(row, userId, now);
}
export async function markHelpful(deps: CvReviewDeps, userId: string, requestId: string) {
  const now = nowOf(deps);
  const result = await deps.db.$transaction(async (tx) => {
    await lockUsers(tx, [userId]);
    await actor(tx, userId, now);
    await tx.$queryRaw`SELECT "id" FROM "CvReviewRequest" WHERE "id" = ${requestId} FOR UPDATE`;
    const row = await tx.cvReviewRequest.findUnique({ where: { id: requestId }, select });
    if (!row || row.studentId !== userId) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (row.status !== 'COMPLETED') throw codedConflict('CV_REVIEW_CLOSED');
    if (row.helpfulAt) throw codedConflict('CV_REVIEW_ALREADY_HELPFUL');
    return view(
      await tx.cvReviewRequest.update({
        where: { id: requestId },
        data: { helpfulAt: now },
        select,
      }),
      userId,
      now,
    );
  });
  // Puan (P1-16): "faydalı" işareti tek puan olayıdır; yazım işlem dışında, hatası akışı bozmaz (uzlaştırma tamamlar).
  await awardSafely(() => awardForCvReview({ db: deps.db, now: deps.now }, requestId));
  return result;
}
export async function listRequests(
  deps: CvReviewDeps,
  userId: string,
  input: { role: 'STUDENT' | 'MENTOR'; cursor?: string; limit: number },
) {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await actor(tx, userId, now, input.role === 'MENTOR');
    const rows = await tx.cvReviewRequest.findMany({
      where: input.role === 'MENTOR' ? { mentorId: userId } : { studentId: userId },
      orderBy: { id: 'desc' },
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: input.limit + 1,
      select,
    });
    const more = rows.length > input.limit;
    const items = rows.slice(0, input.limit);
    return {
      items: items.map((row) => view(row, userId, now)),
      nextCursor: more ? items.at(-1)!.id : null,
    };
  });
}
export async function readFile(deps: CvReviewDeps, userId: string, requestId: string) {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const ref = await tx.cvReviewRequest.findUnique({
      where: { id: requestId },
      select: { studentId: true, mentorId: true },
    });
    if (!ref || ref.mentorId !== userId) throw codedForbidden('AUTH_FORBIDDEN');
    await lockUsers(tx, [ref.studentId, ref.mentorId]);
    await tx.$queryRaw`SELECT "id" FROM "CvReviewRequest" WHERE "id" = ${requestId} FOR SHARE`;
    const row = await tx.cvReviewRequest.findUnique({
      where: { id: requestId },
      include: { cvUpload: { select: { storageKey: true } } },
    });
    if (
      !row ||
      row.mentorId !== userId ||
      row.status !== 'OPEN' ||
      row.expiresAt <= now ||
      !row.cvUpload.storageKey
    )
      throw codedForbidden('AUTH_FORBIDDEN');
    await actor(tx, userId, now, true);
    const bytes = await deps.storage.get(row.cvUpload.storageKey);
    if (!bytes) throw codedNotFound('RESOURCE_NOT_FOUND');
    return bytes;
  });
}
export async function expireRequests(deps: CvReviewDeps) {
  const now = nowOf(deps);
  const rows = await deps.db.cvReviewRequest.findMany({
    where: { status: 'OPEN', expiresAt: { lte: now } },
    select: { id: true, studentId: true, mentorId: true },
  });
  let expired = 0;
  for (const ref of rows) {
    const changed = await deps.db.$transaction(
      async (tx) => {
        await lockUsers(tx, [ref.studentId, ref.mentorId]);
        await tx.$queryRaw`SELECT "id" FROM "CvReviewRequest" WHERE "id" = ${ref.id} FOR UPDATE`;
        const row = await tx.cvReviewRequest.findUnique({ where: { id: ref.id } });
        if (!row || row.status !== 'OPEN' || row.expiresAt > now) return false;
        await tx.cvReviewRequest.update({ where: { id: row.id }, data: { status: 'EXPIRED' } });
        await releaseOldFile(tx, deps.storage, row);
        return true;
      },
      { timeout: 30000 },
    );
    if (changed) {
      expired++;
      await deps.notify?.(ref.studentId, 'expired', ref.id).catch(() => undefined);
    }
  }
  return expired;
}

export async function getSettings(deps: CvReviewDeps, userId: string) {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await actor(tx, userId, now, true);
    const row = await tx.mentorProfile.findUniqueOrThrow({ where: { userId } });
    return { enabled: row.cvReviewEnabled, monthlyLimit: row.cvReviewMonthlyLimit };
  });
}
export async function saveSettings(
  deps: CvReviewDeps,
  userId: string,
  input: { enabled: boolean; monthlyLimit: number },
) {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await lockUsers(tx, [userId]);
    await actor(tx, userId, now, true);
    const row = await tx.mentorProfile.update({
      where: { userId },
      data: { cvReviewEnabled: input.enabled, cvReviewMonthlyLimit: input.monthlyLimit },
    });
    return { enabled: row.cvReviewEnabled, monthlyLimit: row.cvReviewMonthlyLimit };
  });
}
