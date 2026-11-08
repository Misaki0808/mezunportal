import 'server-only';

import {
  EXPERIENCE_REPORT_RATE_LIMIT,
  experienceIdSchema,
  experienceTemplateSchema,
  listExperienceReportsSchema,
  listModerationQueueSchema,
  listMyExperiencesSchema,
  reportExperienceSchema,
  resolveExperienceReportSchema,
  reviewExperienceSchema,
  saveExperienceDraftSchema,
  type ExperienceIdInput,
  type ExperiencePage,
  type ExperienceReportPage,
  type ListExperienceReportsInput,
  type ListModerationQueueInput,
  type ListMyExperiencesInput,
  type ReportExperienceInput,
  type ReportExperienceOutput,
  type ResolveExperienceReportInput,
  type ResolveExperienceReportOutput,
  type ReviewExperienceInput,
  type ReviewExperienceOutput,
  type SaveExperienceDraftInput,
  type SubmitExperienceOutput,
} from '@/contracts/experience';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { codedConflict, codedForbidden, codedNotFound, codedValidation } from '@/lib/errors';
import { createPermissions, type Actor } from '../permissions';
import { canEditExperience, canReadExperience } from '../rules/experience';
import { recordAdminAction } from './audit';
import {
  draftColumns,
  experienceContent,
  experienceSelect,
  projectExperience,
  type ExperienceRow,
} from './experienceProjection';
import { consumeRateLimit } from './rateLimit';
import type { EXPERIENCE_TYPES } from '@/contracts/experience';
import { stageNotification } from './notification-intent';
import { emitEvent } from './event';
import { awardForExperience, awardSafely } from './points';
import { requireConsent } from './privacy';

type Tx = Prisma.TransactionClient;
function permissionsFor(tx: Tx, userId: string, now: Date) {
  return createPermissions({ db: () => tx, getSessionUserId: async () => userId, now: () => now });
}
/** Hesap silme de User → Experience sırasını kullanır. Kimlik/yetki kilitten sonra tekrar okunur. */
async function asMember<T>(
  db: PrismaClient,
  userId: string,
  now: Date,
  run: (tx: Tx, actor: Actor, permissions: ReturnType<typeof permissionsFor>) => Promise<T>,
  relatedUserIds: readonly string[] = [],
) {
  return db.$transaction(async (tx) => {
    const ids = [...new Set([userId, ...relatedUserIds])].sort();
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
    const permissions = permissionsFor(tx, userId, now);
    const actor = await permissions.requireVerifiedMember();
    return run(tx, actor, permissions);
  });
}
async function loadExperience(tx: Tx, id: string, lock = false): Promise<ExperienceRow> {
  if (lock) await tx.$queryRaw`SELECT "id" FROM "Experience" WHERE "id"=${id} FOR UPDATE`;
  const row = await tx.experience.findUnique({ where: { id }, select: experienceSelect });
  if (!row) throw codedNotFound('RESOURCE_NOT_FOUND');
  return row;
}
async function sameUniversity(tx: Tx, actor: Actor, row: ExperienceRow) {
  const departmentIds = actor.facts.memberships
    .filter((m) => m.endedAt === null && m.verificationStatus === 'VERIFIED')
    .map((m) => m.departmentId);
  return (
    (await tx.department.count({
      where: {
        id: { in: departmentIds },
        faculty: { universityId: row.department.faculty.universityId },
      },
    })) > 0
  );
}
async function requireReadable(
  tx: Tx,
  actor: Actor,
  permissions: ReturnType<typeof permissionsFor>,
  row: ExperienceRow,
) {
  const sameSchool = await sameUniversity(tx, actor, row);
  const moderator = await permissions.canModerate(actor, row.departmentIdAtWrite);
  const allowed = canReadExperience({
    status: row.status,
    isOwner: row.authorId === actor.userId,
    sameUniversity: sameSchool,
    canModerate: moderator,
  });
  if (!allowed) throw codedNotFound('RESOURCE_NOT_FOUND');
  // Moderatörün yetkisiyle açılan, normal üyeye görünmeyen detay da yönetim verisidir.
  if (moderator && row.authorId !== actor.userId && !(row.status === 'PUBLISHED' && sameSchool))
    await requireConsent(tx, actor.userId);
}
function requireOwner(row: ExperienceRow, userId: string) {
  if (row.authorId !== userId) throw codedNotFound('RESOURCE_NOT_FOUND');
}
function pageWhere(cursor: string | undefined) {
  return cursor ? { id: { lt: cursor } } : {};
}
function page<T extends { id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}
async function moderatorDepartments(
  actor: Actor,
  permissions: ReturnType<typeof permissionsFor>,
  departmentId?: string,
) {
  if (actor.facts.grants.length === 0) throw codedForbidden('AUTH_FORBIDDEN');
  const ids = await permissions.managedDepartmentIds(actor);
  if (departmentId && !ids.includes(departmentId)) throw codedForbidden('AUTH_FORBIDDEN');
  return departmentId ? [departmentId] : ids;
}

export async function saveExperienceDraft(
  db: PrismaClient,
  userId: string,
  input: SaveExperienceDraftInput,
  now = new Date(),
) {
  return asMember(db, userId, now, async (tx, actor) => {
    const parsed = saveExperienceDraftSchema.parse(input);
    // CV daveti imzası ayrıldı; P1-05 bağlanana kadar sahte kaynağa bakarak veri üretilmez.
    if (parsed.prefillPositionId) throw codedValidation('VALIDATION_INVALID');
    const data = {
      ...draftColumns(parsed.content),
      isAnonymous: parsed.isAnonymous,
      status: 'DRAFT' as const,
      moderationNote: null,
      moderatedById: null,
      moderatedAt: null,
      publishedAt: null,
    };
    if (parsed.experienceId) {
      const current = await loadExperience(tx, parsed.experienceId, true);
      requireOwner(current, userId);
      if (!canEditExperience(current.status)) throw codedConflict('EXPERIENCE_NOT_EDITABLE');
      if (current.departmentIdAtWrite !== parsed.departmentId)
        throw codedForbidden('AUTH_FORBIDDEN');
      return projectExperience(
        await tx.experience.update({ where: { id: current.id }, data, select: experienceSelect }),
      );
    }
    if (
      !actor.facts.memberships.some(
        (m) =>
          m.departmentId === parsed.departmentId &&
          m.endedAt === null &&
          m.verificationStatus === 'VERIFIED',
      )
    )
      throw codedForbidden('AUTH_FORBIDDEN');
    return projectExperience(
      await tx.experience.create({
        data: { ...data, authorId: userId, departmentIdAtWrite: parsed.departmentId },
        select: experienceSelect,
      }),
    );
  });
}
export async function submitExperience(
  db: PrismaClient,
  userId: string,
  input: ExperienceIdInput,
  now = new Date(),
): Promise<SubmitExperienceOutput> {
  return asMember(db, userId, now, async (tx) => {
    const parsed = experienceIdSchema.parse(input);
    const row = await loadExperience(tx, parsed.experienceId, true);
    requireOwner(row, userId);
    if (row.status !== 'DRAFT') throw codedConflict('EXPERIENCE_NOT_DRAFT');
    if (!experienceTemplateSchema.safeParse(experienceContent(row)).success)
      throw codedValidation('EXPERIENCE_INCOMPLETE');
    await tx.experience.update({ where: { id: row.id }, data: { status: 'PENDING' } });
    return { experienceId: row.id, status: 'PENDING' };
  });
}
export async function reviewExperience(
  db: PrismaClient,
  userId: string,
  input: ReviewExperienceInput,
  now = new Date(),
): Promise<ReviewExperienceOutput> {
  type ExperienceKind = (typeof EXPERIENCE_TYPES)[number];
  let published: { type: ExperienceKind; anonymous: boolean; authorId: string | null } | null =
    null;
  const subject = await db.experience.findUnique({
    where: { id: input.experienceId },
    select: { authorId: true },
  });
  const output: ReviewExperienceOutput = await asMember(
    db,
    userId,
    now,
    async (tx, actor, permissions) => {
      const parsed = reviewExperienceSchema.parse(input);
      const row = await loadExperience(tx, parsed.experienceId, true);
      if (!(await permissions.canModerate(actor, row.departmentIdAtWrite)))
        throw codedNotFound('RESOURCE_NOT_FOUND');
      await requireConsent(tx, userId);
      if (row.status !== 'PENDING') throw codedConflict('EXPERIENCE_NOT_PENDING');
      const status = parsed.decision === 'PUBLISH' ? 'PUBLISHED' : 'REJECTED';
      const moderated = await tx.experience.update({
        where: { id: row.id },
        data: {
          status,
          moderatedById: userId,
          moderatedAt: now,
          publishedAt: status === 'PUBLISHED' ? now : null,
          moderationNote: parsed.decision === 'REJECT' ? parsed.reason : null,
        },
      });
      if (row.authorId)
        await stageNotification(tx, row.authorId, {
          type: 'generic',
          event: status === 'PUBLISHED' ? 'moderationApproved' : 'moderationRejected',
          eventId: `${row.id}:${moderated.updatedAt.toISOString()}`,
          path: '/deneyimlerim',
        });
      await recordAdminAction(tx, {
        actor,
        action: status === 'PUBLISHED' ? 'MODERATION_PUBLISH' : 'MODERATION_REJECT',
        targetType: 'EXPERIENCE',
        targetId: row.id,
        reason: parsed.decision === 'REJECT' ? parsed.reason : undefined,
        metadata: { departmentId: row.departmentIdAtWrite },
      });
      if (status === 'PUBLISHED') {
        published = { type: row.type, anonymous: row.isAnonymous, authorId: row.authorId };
      }
      return { experienceId: row.id, status };
    },
    subject?.authorId ? [subject.authorId] : [],
  );
  // Kullanım olayı (P1-13): yayın işlemi bittikten sonra. ANONİM deneyimde olay yazarla ilişkilendirilmez
  // (kullanıcı, rol ve bölüm boş): sayı kalır, anonimlik sızmaz.
  const done = published as {
    type: ExperienceKind;
    anonymous: boolean;
    authorId: string | null;
  } | null;
  if (done) {
    // Puan (P1-16): yayın işlemi bittikten sonra; hata yayını bozmaz (günlük uzlaştırma tamamlar).
    await awardSafely(() => awardForExperience({ db, now: () => now }, output.experienceId));
    emitEvent(
      db,
      done.anonymous ? null : done.authorId,
      {
        type: 'EXPERIENCE_PUBLISHED',
        props: { experienceType: done.type, anonymous: done.anonymous },
      },
      done.anonymous ? null : undefined,
    );
  }
  return output;
}
export async function getExperienceDetail(
  db: PrismaClient,
  userId: string,
  input: ExperienceIdInput,
  now = new Date(),
) {
  return asMember(db, userId, now, async (tx, actor, permissions) => {
    const parsed = experienceIdSchema.parse(input);
    const row = await loadExperience(tx, parsed.experienceId);
    await requireReadable(tx, actor, permissions, row);
    return projectExperience(row, now);
  });
}
export async function listMyExperiences(
  db: PrismaClient,
  userId: string,
  input: ListMyExperiencesInput,
  now = new Date(),
): Promise<ExperiencePage> {
  return asMember(db, userId, now, async (tx) => {
    const parsed = listMyExperiencesSchema.parse(input);
    const rows = await tx.experience.findMany({
      where: {
        authorId: userId,
        ...(parsed.status ? { status: parsed.status } : {}),
        ...pageWhere(parsed.cursor),
      },
      select: experienceSelect,
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
    });
    const result = page(rows, parsed.limit);
    return { ...result, items: result.items.map((item) => projectExperience(item, now)) };
  });
}
export async function listModerationQueue(
  db: PrismaClient,
  userId: string,
  input: ListModerationQueueInput,
  now = new Date(),
): Promise<ExperiencePage> {
  return asMember(db, userId, now, async (tx, actor, permissions) => {
    const parsed = listModerationQueueSchema.parse(input);
    const ids = await moderatorDepartments(actor, permissions, parsed.departmentId);
    await requireConsent(tx, userId);
    const rows = await tx.experience.findMany({
      where: { departmentIdAtWrite: { in: ids }, status: 'PENDING', ...pageWhere(parsed.cursor) },
      select: experienceSelect,
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
    });
    const result = page(rows, parsed.limit);
    return { ...result, items: result.items.map((item) => projectExperience(item, now)) };
  });
}
const reportSelect = {
  id: true,
  targetType: true,
  targetId: true,
  reason: true,
  status: true,
  reviewedAt: true,
  resolutionNote: true,
  createdAt: true,
} satisfies Prisma.ReportSelect;
export async function reportExperience(
  db: PrismaClient,
  userId: string,
  input: ReportExperienceInput,
  now = new Date(),
): Promise<ReportExperienceOutput> {
  return asMember(db, userId, now, async (tx, actor, permissions) => {
    const parsed = reportExperienceSchema.parse(input);
    const row = await loadExperience(tx, parsed.experienceId, true);
    await requireReadable(tx, actor, permissions, row);
    if (row.status !== 'PUBLISHED') throw codedConflict('EXPERIENCE_NOT_PUBLISHED');
    if (
      await tx.report.findFirst({
        where: { targetId: row.id, reporterId: userId, status: 'OPEN' },
        select: { id: true },
      })
    )
      throw codedConflict('REPORT_ALREADY_OPEN');
    await consumeRateLimit(
      tx,
      {
        name: 'experience-report',
        limit: EXPERIENCE_REPORT_RATE_LIMIT.maxRequests,
        windowMs: EXPERIENCE_REPORT_RATE_LIMIT.windowSeconds * 1000,
      },
      userId,
      now,
    );
    const result = await tx.report.create({
      data: { targetId: row.id, reporterId: userId, reason: parsed.reason },
      select: { id: true },
    });
    return { reportId: result.id, status: 'OPEN' };
  });
}
export async function listExperienceReports(
  db: PrismaClient,
  userId: string,
  input: ListExperienceReportsInput,
  now = new Date(),
): Promise<ExperienceReportPage> {
  return asMember(db, userId, now, async (tx, actor, permissions) => {
    const parsed = listExperienceReportsSchema.parse(input);
    const ids = await moderatorDepartments(actor, permissions, parsed.departmentId);
    await requireConsent(tx, userId);
    const rows = await tx.report.findMany({
      where: {
        status: parsed.status,
        target: { departmentIdAtWrite: { in: ids } },
        ...pageWhere(parsed.cursor),
      },
      select: reportSelect,
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
    });
    return page(rows, parsed.limit);
  });
}
export async function resolveExperienceReport(
  db: PrismaClient,
  userId: string,
  input: ResolveExperienceReportInput,
  now = new Date(),
): Promise<ResolveExperienceReportOutput> {
  return asMember(db, userId, now, async (tx, actor, permissions) => {
    const parsed = resolveExperienceReportSchema.parse(input);
    // Silme Experience → Report sırasındadır; burada da önce hedefi kilitle, sonra güncel raporu oku.
    const target = await tx.report.findUnique({
      where: { id: parsed.reportId },
      select: { targetId: true },
    });
    if (!target) throw codedNotFound('RESOURCE_NOT_FOUND');
    const row = await loadExperience(tx, target.targetId, true);
    if (!(await permissions.canModerate(actor, row.departmentIdAtWrite)))
      throw codedForbidden('AUTH_FORBIDDEN');
    await requireConsent(tx, userId);
    const report = await tx.report.findUnique({
      where: { id: parsed.reportId },
      select: { status: true },
    });
    if (!report) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (report.status !== 'OPEN') throw codedConflict('REPORT_NOT_OPEN');
    await tx.report.update({
      where: { id: parsed.reportId },
      data: {
        status: parsed.decision,
        reviewedById: userId,
        reviewedAt: now,
        resolutionNote: parsed.reason,
      },
    });
    await recordAdminAction(tx, {
      actor,
      action: 'REPORT_RESOLVE',
      targetType: 'REPORT',
      targetId: parsed.reportId,
      reason: parsed.reason,
      metadata: { experienceId: row.id, decision: parsed.decision },
    });
    return { reportId: parsed.reportId, status: parsed.decision };
  });
}
