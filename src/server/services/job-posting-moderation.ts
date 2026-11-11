import 'server-only';

import {
  JOB_POSTING_AUTHOR_ROLES,
  jobPostingModerationPageSchema,
  jobPostingReportPageSchema,
  listJobPostingModerationQueueSchema,
  listJobPostingReportsSchema,
  resolveJobPostingReportOutputSchema,
  resolveJobPostingReportSchema,
  reviewJobPostingOutputSchema,
  reviewJobPostingSchema,
  type JobPostingModerationPage,
  type JobPostingReportPage,
  type ListJobPostingModerationQueueInput,
  type ListJobPostingReportsInput,
  type ResolveJobPostingReportInput,
  type ResolveJobPostingReportOutput,
  type ReviewJobPostingInput,
  type ReviewJobPostingOutput,
} from '@/contracts/job-postings';
import { codedConflict, codedForbidden, codedNotFound, codedValidation } from '@/lib/errors';

import { dayOfDateColumn, deadlineProblem, istanbulDay } from '../rules/jobPosting';
import {
  covers,
  idCursorWhere,
  intersectDepartments,
  loadAnyAdmin,
  nowOf,
  readAsAdmin,
  toPage,
  TX_OPTIONS,
  type AdminDeps,
  type Tx,
} from './admin-access';
import { recordAdminAction } from './audit';
import { emitEvent } from './event';
import { MY_POSTING_SELECT, projectMyPosting } from './job-postings';
import { stageNotification } from './notification-intent';
import { stageJobMatches } from './job-match';
import { awardJobPostingInTx, withdrawJobPostingPoints } from './points';
import { requireConsent } from './privacy';

/**
 * İlan moderasyonu (P2-04): kuyruk, yayımla/reddet, şikâyet listesi ve sonuçlandırma. Yetki işlemin içinde yeniden yüklenir
 * (`loadAnyAdmin`) ve ilanın YAZILDIĞI bölümün kapsamıyla doğrulanır (deneyim/SSS moderasyonuyla aynı kalıp). Karar ve işlem kaydı
 * AYNI işlemde yazılır; yayın puanı da aynı işlemde yazılır (idempotent). Yönetici verisi gösteren her eylem merkezî rıza denetiminden
 * (`requireConsent`) geçer.
 */

async function lockedPosting(tx: Tx, postingId: string) {
  await tx.$queryRaw`SELECT "id" FROM "JobPosting" WHERE "id"=${postingId} FOR UPDATE`;
  const row = await tx.jobPosting.findUnique({
    where: { id: postingId },
    select: {
      id: true,
      status: true,
      authorId: true,
      kind: true,
      deadlineOn: true,
      departmentIdAtWrite: true,
    },
  });
  if (!row) throw codedNotFound('RESOURCE_NOT_FOUND');
  return row;
}

/** Kapsam dışı ilan: yetkisiz (deneyim moderasyonuyla aynı). */
async function requireInScope(
  tx: Tx,
  admin: Awaited<ReturnType<typeof loadAnyAdmin>>,
  postingId: string,
) {
  const row = await lockedPosting(tx, postingId);
  if (!(await covers(tx, admin, row.departmentIdAtWrite))) throw codedForbidden('AUTH_FORBIDDEN');
  return row;
}

/** Yöneticinin kapsamındaki bölümlerin incelenecek ilanları (yeniden eskiye); yazarın görünen adı ve rolüyle. */
export async function listJobPostingModerationQueue(
  deps: AdminDeps,
  adminId: string,
  input: ListJobPostingModerationQueueInput,
): Promise<JobPostingModerationPage> {
  const parsed = listJobPostingModerationQueueSchema.parse(input);
  return readAsAdmin(deps, adminId, 'ANY_ADMIN', async ({ tx, departmentIds }) => {
    await requireConsent(tx, adminId);
    const rows = await tx.jobPosting.findMany({
      where: {
        status: 'PENDING',
        departmentIdAtWrite: { in: intersectDepartments(departmentIds, parsed.departmentId) },
        ...idCursorWhere(parsed.cursor),
      },
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
      select: {
        ...MY_POSTING_SELECT,
        authorId: true,
        author: { select: { name: true } },
      },
    });
    const page = toPage(rows, parsed.limit);
    const memberships = await tx.membership.findMany({
      where: {
        userId: { in: page.items.map((row) => row.authorId) },
        endedAt: null,
        verificationStatus: 'VERIFIED',
        role: { in: [...JOB_POSTING_AUTHOR_ROLES] },
      },
      select: { userId: true, departmentId: true, role: true },
    });
    const roleOf = (row: (typeof page.items)[number]) =>
      memberships.find(
        (m) => m.userId === row.authorId && m.departmentId === row.departmentIdAtWrite,
      )?.role ??
      memberships.find((m) => m.userId === row.authorId)?.role ??
      null;
    return jobPostingModerationPageSchema.parse({
      items: page.items.map((row) => ({
        ...projectMyPosting(row),
        author: {
          displayName: row.author.name,
          role: (JOB_POSTING_AUTHOR_ROLES as readonly string[]).includes(roleOf(row) ?? '')
            ? roleOf(row)
            : null,
        },
      })),
      nextCursor: page.nextCursor,
    });
  });
}

/**
 * Yayımlar ya da gerekçeyle reddeder (`PENDING` → `PUBLISHED`/`REJECTED`). Yayında son başvuru günü geçmişse
 * `JOB_POSTING_DEADLINE_INVALID` (yazar düzenleyip yeniden gönderir; moderatör süreyi uzatamaz). Yayında yazara puan yazılır
 * (aynı işlemde, ayda 3 tavanı), bildirim (outbox) aynı işlemde sıraya girer.
 */
export async function reviewJobPosting(
  deps: AdminDeps,
  adminId: string,
  input: ReviewJobPostingInput,
): Promise<ReviewJobPostingOutput> {
  const parsed = reviewJobPostingSchema.parse(input);
  const now = nowOf(deps);
  let published: { authorId: string; kind: 'INTERNSHIP' | 'JOB' } | null = null;
  const output = await deps.db.$transaction(async (tx) => {
    const admin = await loadAnyAdmin(tx, adminId, now);
    await requireConsent(tx, adminId);
    const row = await requireInScope(tx, admin, parsed.postingId);
    if (row.status !== 'PENDING') throw codedConflict('JOB_POSTING_NOT_PENDING');
    if (parsed.decision === 'PUBLISH') {
      const today = istanbulDay(now);
      if (!row.deadlineOn || deadlineProblem(dayOfDateColumn(row.deadlineOn), today) !== null)
        throw codedValidation('JOB_POSTING_DEADLINE_INVALID');
      await tx.jobPosting.update({
        where: { id: row.id },
        data: { status: 'PUBLISHED', moderatedById: adminId, moderatedAt: now, publishedAt: now },
      });
      await recordAdminAction(tx, {
        actor: admin,
        action: 'MODERATION_PUBLISH',
        targetType: 'JOB_POSTING',
        targetId: row.id,
        metadata: { departmentId: row.departmentIdAtWrite },
      });
      await stageNotification(tx, row.authorId, {
        type: 'generic',
        event: 'jobPostingPublished',
        eventId: row.id,
        path: '/ilanlarim',
      });
      await stageJobMatches(tx, row.id, now);
      // Puan yayınla AYNI işlemde (idempotent; ay tavanı kilit altında). Uzlaştırma güvenlik ağıdır.
      await awardJobPostingInTx(tx, row.id, now);
      published = { authorId: row.authorId, kind: row.kind };
      return reviewJobPostingOutputSchema.parse({ postingId: row.id, status: 'PUBLISHED' });
    }
    await tx.jobPosting.update({
      where: { id: row.id },
      data: {
        status: 'REJECTED',
        moderatedById: adminId,
        moderatedAt: now,
        moderationNote: parsed.reason,
      },
    });
    await recordAdminAction(tx, {
      actor: admin,
      action: 'MODERATION_REJECT',
      targetType: 'JOB_POSTING',
      targetId: row.id,
      reason: parsed.reason,
      metadata: { departmentId: row.departmentIdAtWrite },
    });
    await stageNotification(tx, row.authorId, {
      type: 'generic',
      event: 'jobPostingRejected',
      eventId: `${row.id}:${now.toISOString()}`,
      path: '/ilanlarim',
    });
    return reviewJobPostingOutputSchema.parse({ postingId: row.id, status: 'REJECTED' });
  }, TX_OPTIONS);
  const done = published as { authorId: string; kind: 'INTERNSHIP' | 'JOB' } | null;
  if (done)
    emitEvent(deps.db, done.authorId, {
      type: 'JOB_POSTING_PUBLISHED',
      props: { kind: done.kind },
    });
  return output;
}

/** Yöneticinin kapsamındaki ilanların şikâyetleri (raportör kimliği çıktıda yok). */
export async function listJobPostingReports(
  deps: AdminDeps,
  adminId: string,
  input: ListJobPostingReportsInput,
): Promise<JobPostingReportPage> {
  const parsed = listJobPostingReportsSchema.parse(input);
  return readAsAdmin(deps, adminId, 'ANY_ADMIN', async ({ tx, departmentIds }) => {
    await requireConsent(tx, adminId);
    const rows = await tx.jobPostingReport.findMany({
      where: {
        status: parsed.status,
        posting: {
          targets: {
            some: {
              departmentId: { in: intersectDepartments(departmentIds, parsed.departmentId) },
            },
          },
        },
        ...idCursorWhere(parsed.cursor),
      },
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
      select: {
        id: true,
        postingId: true,
        reason: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        resolutionNote: true,
        posting: { select: { title: true, status: true } },
      },
    });
    const page = toPage(rows, parsed.limit);
    return jobPostingReportPageSchema.parse({
      items: page.items.map(({ posting, ...row }) => ({
        ...row,
        postingTitle: posting.title,
        postingStatus: posting.status,
      })),
      nextCursor: page.nextCursor,
    });
  });
}

/**
 * Şikâyeti sonuçlandırır. `DISMISS` ilanı yerinde bırakır; `TAKE_DOWN` ilanı `CLOSED` yapar (kesinleşmemiş puan geri alınır) ve aynı
 * ilanın diğer açık şikâyetlerini de aynı gerekçeyle `RESOLVED` kapatır. Gerekçe zorunlu; işlem kaydı aynı işlemde. Önce ilan,
 * sonra şikâyet kilitlenir (ilan silme sırası).
 */
export async function resolveJobPostingReport(
  deps: AdminDeps,
  adminId: string,
  input: ResolveJobPostingReportInput,
): Promise<ResolveJobPostingReportOutput> {
  const parsed = resolveJobPostingReportSchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const admin = await loadAnyAdmin(tx, adminId, now);
    const target = await tx.jobPostingReport.findUnique({
      where: { id: parsed.reportId },
      select: { postingId: true },
    });
    if (!target) throw codedNotFound('RESOURCE_NOT_FOUND');
    const posting = await lockedPosting(tx, target.postingId);
    const targets = await tx.jobPostingDepartment.findMany({
      where: { postingId: target.postingId },
      select: { departmentId: true },
    });
    let inScope = false;
    for (const targetDepartment of targets) {
      if (await covers(tx, admin, targetDepartment.departmentId)) {
        inScope = true;
        break;
      }
    }
    if (!inScope) throw codedForbidden('AUTH_FORBIDDEN');
    await requireConsent(tx, adminId);
    const report = await tx.jobPostingReport.findUnique({
      where: { id: parsed.reportId },
      select: { status: true },
    });
    if (!report) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (report.status !== 'OPEN') throw codedConflict('REPORT_NOT_OPEN');
    const status = parsed.decision === 'TAKE_DOWN' ? 'RESOLVED' : 'DISMISSED';
    const decided = {
      status,
      reviewedAt: now,
      reviewedById: adminId,
      resolutionNote: parsed.reason,
    } as const;
    await tx.jobPostingReport.update({ where: { id: parsed.reportId }, data: decided });
    let withdrawnPoints = 0;
    if (parsed.decision === 'TAKE_DOWN') {
      if (posting.status === 'PENDING' || posting.status === 'PUBLISHED') {
        await tx.jobPosting.update({
          where: { id: posting.id },
          data: { status: 'CLOSED', endedAt: now, endedById: adminId },
        });
        withdrawnPoints = await withdrawJobPostingPoints(tx, posting.id, now);
      }
      // Aynı ilanın diğer açık şikâyetleri aynı karara bağlanır (kuyrukta sahipsiz kalmaz).
      await tx.jobPostingReport.updateMany({
        where: { postingId: posting.id, status: 'OPEN' },
        data: decided,
      });
    }
    await recordAdminAction(tx, {
      actor: admin,
      action: 'REPORT_RESOLVE',
      targetType: 'REPORT',
      targetId: parsed.reportId,
      reason: parsed.reason,
      metadata: { postingId: posting.id, decision: parsed.decision, withdrawnPoints },
    });
    return resolveJobPostingReportOutputSchema.parse({ reportId: parsed.reportId, status });
  }, TX_OPTIONS);
}
