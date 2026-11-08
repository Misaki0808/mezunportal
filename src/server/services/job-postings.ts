import 'server-only';

import {
  JOB_POSTING_AUTHOR_ROLES,
  JOB_POSTING_MAX_DAYS,
  JOB_POSTING_SUBMIT_LIMIT,
  JOB_POSTING_SUBMIT_WINDOW_DAYS,
  JOB_POSTING_TARGETS_MAX,
  closeJobPostingOutputSchema,
  JOB_POSTING_FILTER_OPTIONS_LIMIT,
  getJobPostingFilterOptionsSchema,
  getJobPostingSchema,
  jobPostingCardSchema,
  jobPostingContentSchema,
  jobPostingDetailSchema,
  jobPostingFilterOptionsSchema,
  jobPostingFormContextSchema,
  jobPostingIdSchema,
  jobPostingPageSchema,
  listMyJobPostingsSchema,
  myJobPostingPageSchema,
  myJobPostingViewSchema,
  reportJobPostingOutputSchema,
  reportJobPostingSchema,
  saveJobPostingDraftSchema,
  searchJobPostingsSchema,
  submitJobPostingOutputSchema,
  type CloseJobPostingOutput,
  type GetJobPostingFilterOptionsInput,
  type GetJobPostingInput,
  type JobPostingDetail,
  type JobPostingFilterOptions,
  type JobPostingFormContext,
  type JobPostingIdInput,
  type JobPostingPage,
  type ListMyJobPostingsInput,
  type MyJobPostingPage,
  type MyJobPostingView,
  type ReportJobPostingInput,
  type ReportJobPostingOutput,
  type SaveJobPostingDraftInput,
  type SearchJobPostingsInput,
  type SubmitJobPostingOutput,
} from '@/contracts/job-postings';
import { resultBucketOf } from '@/contracts/metrics';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { codedConflict, codedForbidden, codedNotFound, codedValidation } from '@/lib/errors';

import {
  findJobPostingRow,
  jobPostingFilterOptionRows,
  searchJobPostingRows,
} from '../repositories/job-postings';
import { createPermissions } from '../permissions/guards';
import type { Actor } from '../permissions/actor';
import {
  canClosePosting,
  canEditPosting,
  dayOfDateColumn,
  daysLeft,
  deadlineProblem,
  isOpen,
  istanbulDay,
} from '../rules/jobPosting';
import { idCursorWhere, toPage } from './admin-access';
import { emitEvent } from './event';
import { stageNotification } from './notification-intent';
import { withdrawJobPostingPoints } from './points';
import { requireConsent } from './privacy';
import { RATE_LIMITS, consumeRateLimit } from './rateLimit';
import { viewerUniversityIds } from './search';

/**
 * Mezun staj/iş ilanları servisi — yazar, okuyucu ve şikâyet tarafı (P2-04; sözleşme `src/contracts/job-postings.ts`).
 * Moderasyon `job-posting-moderation.ts`'tedir. Yetki işlemin İÇİNDE, kullanıcı satırı `FOR SHARE` kilidiyle (hesap silmeyle
 * sıralanır) yeniden yüklenir; kimlik, rol ve kapsam istemci girdisinden güvenilir kabul edilmez.
 */

export type JobPostingDeps = { db: PrismaClient; now?: () => Date };
const nowOf = (deps: JobPostingDeps) => (deps.now ?? (() => new Date()))();
type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

async function asMember<T>(
  deps: JobPostingDeps,
  userId: string,
  run: (tx: Tx, actor: Actor, now: Date) => Promise<T>,
): Promise<T> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR SHARE`;
    const permissions = createPermissions({
      db: () => tx,
      getSessionUserId: async () => userId,
      now: () => now,
    });
    const actor = await permissions.requireVerifiedMember();
    await requireConsent(tx, userId);
    return run(tx, actor, now);
  }, TX_OPTIONS);
}

/** Yazarın doğrulanmış etkin mezun/akademisyen üyelik bölümleri; yoksa yetkisiz. */
function authorDepartmentIds(actor: Actor): string[] {
  const ids = actor.facts.memberships
    .filter(
      (m) =>
        m.endedAt === null &&
        m.verificationStatus === 'VERIFIED' &&
        (JOB_POSTING_AUTHOR_ROLES as readonly string[]).includes(m.role),
    )
    .map((m) => m.departmentId);
  if (ids.length === 0) throw codedForbidden('AUTH_FORBIDDEN');
  return [...new Set(ids)];
}

async function universityOfDepartment(tx: Tx, departmentId: string): Promise<string> {
  const row = await tx.department.findUnique({
    where: { id: departmentId },
    select: { faculty: { select: { universityId: true } } },
  });
  if (!row) throw codedForbidden('AUTH_FORBIDDEN');
  return row.faculty.universityId;
}

// ---------------------------------------------------------------------------------------------
// Görünüm eşlemesi
// ---------------------------------------------------------------------------------------------

export const MY_POSTING_SELECT = {
  id: true,
  status: true,
  kind: true,
  title: true,
  organizationName: true,
  companyId: true,
  location: true,
  isRemote: true,
  description: true,
  applyMethod: true,
  applyUrl: true,
  deadlineOn: true,
  departmentIdAtWrite: true,
  moderationNote: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  publishedAt: true,
  endedAt: true,
  targets: {
    select: { department: { select: { id: true, name: true } } },
    orderBy: { department: { name: 'asc' } },
  },
} satisfies Prisma.JobPostingSelect;
export type MyPostingRow = Prisma.JobPostingGetPayload<{ select: typeof MY_POSTING_SELECT }>;

export function projectMyPosting(row: MyPostingRow): MyJobPostingView {
  return myJobPostingViewSchema.parse({
    id: row.id,
    status: row.status,
    kind: row.kind,
    title: row.title,
    organizationName: row.organizationName,
    companyId: row.companyId,
    location: row.location,
    isRemote: row.isRemote,
    description: row.description,
    applyMethod: row.applyMethod,
    applyUrl: row.applyUrl,
    deadlineOn: row.deadlineOn ? dayOfDateColumn(row.deadlineOn) : null,
    departmentId: row.departmentIdAtWrite,
    targetDepartments: row.targets.map((t) => t.department),
    moderationNote: row.moderationNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt,
    publishedAt: row.publishedAt,
    endedAt: row.endedAt,
  });
}

async function loadOwnPosting(tx: Tx, id: string, userId: string, lock = true) {
  if (lock) await tx.$queryRaw`SELECT "id" FROM "JobPosting" WHERE "id"=${id} FOR UPDATE`;
  const row = await tx.jobPosting.findUnique({ where: { id }, select: MY_POSTING_SELECT });
  const owner = await tx.jobPosting.findUnique({ where: { id }, select: { authorId: true } });
  // Başkasının ilanı varlığını sızdırmaz.
  if (!row || owner?.authorId !== userId) throw codedNotFound('RESOURCE_NOT_FOUND');
  return row;
}

// ---------------------------------------------------------------------------------------------
// Yazar
// ---------------------------------------------------------------------------------------------

/** Form bağlamı: yazarın üyelik bölümleri ve (aynı üniversitedeki) hedef olabilecek bölümler. */
export async function getJobPostingFormContext(
  deps: JobPostingDeps,
  userId: string,
): Promise<JobPostingFormContext> {
  return asMember(deps, userId, async (tx, actor) => {
    const ids = authorDepartmentIds(actor);
    const departments = await tx.department.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, faculty: { select: { universityId: true } } },
      orderBy: { name: 'asc' },
    });
    const universityIds = [...new Set(departments.map((d) => d.faculty.universityId))];
    const targets = await tx.department.findMany({
      where: { faculty: { universityId: { in: universityIds } } },
      select: { id: true, name: true, faculty: { select: { name: true } } },
      orderBy: [{ faculty: { name: 'asc' } }, { name: 'asc' }],
    });
    return jobPostingFormContextSchema.parse({
      authorDepartments: departments.map(({ id, name }) => ({ id, name })),
      targetDepartments: targets.map((t) => ({
        id: t.id,
        name: t.name,
        facultyName: t.faculty.name,
      })),
      limits: {
        maxDays: JOB_POSTING_MAX_DAYS,
        submitLimit: JOB_POSTING_SUBMIT_LIMIT,
        submitWindowDays: JOB_POSTING_SUBMIT_WINDOW_DAYS,
        maxTargets: JOB_POSTING_TARGETS_MAX,
      },
    });
  });
}

/** Hedef bölümler yazarın üniversitesinden olmalı ve en çok `JOB_POSTING_TARGETS_MAX` tane (tekrarsız). */
async function validTargets(
  tx: Tx,
  universityId: string,
  ids: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length > JOB_POSTING_TARGETS_MAX) throw codedValidation('JOB_POSTING_TARGET_INVALID');
  if (unique.length === 0) return [];
  const count = await tx.department.count({
    where: { id: { in: unique }, faculty: { universityId } },
  });
  if (count !== unique.length) throw codedValidation('JOB_POSTING_TARGET_INVALID');
  return unique;
}

const dayToDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** Taslağı kaydeder (yeni ya da mevcut; tam üzerine yazma). `DRAFT`/`REJECTED` düzenlenir; reddedilmiş ilan `DRAFT` olur. */
export async function saveJobPostingDraft(
  deps: JobPostingDeps,
  userId: string,
  input: SaveJobPostingDraftInput,
): Promise<MyJobPostingView> {
  const parsed = saveJobPostingDraftSchema.parse(input);
  const draft = parsed.content;
  return asMember(deps, userId, async (tx, actor) => {
    const ids = authorDepartmentIds(actor);
    if (!ids.includes(parsed.departmentId)) throw codedForbidden('AUTH_FORBIDDEN');
    const universityId = await universityOfDepartment(tx, parsed.departmentId);
    const targetIds = await validTargets(tx, universityId, draft.targetDepartmentIds ?? []);
    if (draft.applyMethod === 'CONTACT_REQUEST' && draft.applyUrl)
      throw codedValidation('JOB_POSTING_URL_INVALID');
    if (!draft.applyMethod && draft.applyUrl) throw codedValidation('JOB_POSTING_URL_INVALID');
    let companyId: string | null = draft.companyId ?? null;
    if (
      companyId &&
      !(await tx.company.findUnique({ where: { id: companyId }, select: { id: true } }))
    )
      companyId = null;

    const data = {
      kind: draft.kind ?? 'INTERNSHIP',
      title: draft.title ?? null,
      organizationName: draft.organizationName ?? null,
      companyId,
      location: draft.location ?? null,
      isRemote: draft.isRemote ?? false,
      description: draft.description ?? null,
      applyMethod: draft.applyMethod ?? null,
      applyUrl: draft.applyUrl ?? null,
      deadlineOn: draft.deadlineOn ? dayToDate(draft.deadlineOn) : null,
      status: 'DRAFT' as const,
      submittedAt: null,
      moderationNote: null,
      moderatedById: null,
      moderatedAt: null,
      publishedAt: null,
      endedAt: null,
      endedById: null,
    };
    let postingId: string;
    if (parsed.postingId) {
      const current = await loadOwnPosting(tx, parsed.postingId, userId);
      if (!canEditPosting(current.status)) throw codedConflict('JOB_POSTING_NOT_EDITABLE');
      // Moderasyon kapsamı yazım anında sabitlenir (deneyimle aynı kural).
      if (current.departmentIdAtWrite !== parsed.departmentId)
        throw codedForbidden('AUTH_FORBIDDEN');
      await tx.jobPosting.update({ where: { id: current.id }, data });
      postingId = current.id;
    } else {
      const created = await tx.jobPosting.create({
        data: { ...data, authorId: userId, departmentIdAtWrite: parsed.departmentId },
        select: { id: true },
      });
      postingId = created.id;
    }
    await tx.jobPostingDepartment.deleteMany({ where: { postingId } });
    if (targetIds.length > 0)
      await tx.jobPostingDepartment.createMany({
        data: targetIds.map((departmentId) => ({ postingId, departmentId })),
      });
    return projectMyPosting(
      await tx.jobPosting.findUniqueOrThrow({
        where: { id: postingId },
        select: MY_POSTING_SELECT,
      }),
    );
  });
}

/**
 * Taslağı incelemeye gönderir: tam içerik (`jobPostingContentSchema`), son başvuru günü (bugünden önce olamaz, bugünden en çok
 * 60 gün sonra), hedef bölümler yazarın üniversitesinden, yazarın o bölümde hâlâ doğrulanmış mezun/akademisyen üyeliği; hız sınırı
 * 30 günde 5 gönderim. Sözlük şirketi seçildiyse kurum adı sözlükteki adla eşitlenir.
 */
export async function submitJobPosting(
  deps: JobPostingDeps,
  userId: string,
  input: JobPostingIdInput,
): Promise<SubmitJobPostingOutput> {
  const parsed = jobPostingIdSchema.parse(input);
  return asMember(deps, userId, async (tx, actor, now) => {
    const ids = authorDepartmentIds(actor);
    const row = await loadOwnPosting(tx, parsed.postingId, userId);
    if (row.status !== 'DRAFT') throw codedConflict('JOB_POSTING_NOT_DRAFT');
    if (!ids.includes(row.departmentIdAtWrite)) throw codedForbidden('AUTH_FORBIDDEN');
    const company = row.companyId
      ? await tx.company.findUnique({ where: { id: row.companyId }, select: { name: true } })
      : null;
    const organizationName = company?.name ?? row.organizationName;
    const content = jobPostingContentSchema.safeParse({
      kind: row.kind,
      title: row.title ?? undefined,
      organizationName: organizationName ?? undefined,
      companyId: row.companyId,
      location: row.location,
      isRemote: row.isRemote,
      description: row.description ?? undefined,
      applyMethod: row.applyMethod ?? undefined,
      applyUrl: row.applyUrl,
      deadlineOn: row.deadlineOn ? dayOfDateColumn(row.deadlineOn) : undefined,
      targetDepartmentIds: row.targets.map((t) => t.department.id),
    });
    if (!content.success) {
      const fields = new Set(content.error.issues.map((issue) => String(issue.path[0])));
      if (fields.has('applyUrl') && row.applyUrl) throw codedValidation('JOB_POSTING_URL_INVALID');
      if (fields.has('deadlineOn') && row.deadlineOn)
        throw codedValidation('JOB_POSTING_DEADLINE_INVALID');
      throw codedValidation('JOB_POSTING_INCOMPLETE');
    }
    const today = istanbulDay(now);
    if (deadlineProblem(content.data.deadlineOn, today) !== null)
      throw codedValidation('JOB_POSTING_DEADLINE_INVALID');
    const universityId = await universityOfDepartment(tx, row.departmentIdAtWrite);
    await validTargets(tx, universityId, content.data.targetDepartmentIds);
    await consumeRateLimit(tx, RATE_LIMITS.jobPostingSubmit, userId, now);
    await tx.jobPosting.update({
      where: { id: row.id },
      data: { status: 'PENDING', submittedAt: now, organizationName },
    });
    return submitJobPostingOutputSchema.parse({ postingId: row.id, status: 'PENDING' });
  });
}

/**
 * Yazar ilanını çeker (`PENDING`/`PUBLISHED` → `CLOSED`). Kesinleşmemiş ilan puanı geri alınır (`POSTING_WITHDRAWN`);
 * kesinleşmiş puan kalır. Taslak ve diğer durumlar `JOB_POSTING_NOT_OPEN`.
 */
export async function closeJobPosting(
  deps: JobPostingDeps,
  userId: string,
  input: JobPostingIdInput,
): Promise<CloseJobPostingOutput> {
  const parsed = jobPostingIdSchema.parse(input);
  return asMember(deps, userId, async (tx, _actor, now) => {
    const row = await loadOwnPosting(tx, parsed.postingId, userId);
    if (!canClosePosting(row.status)) throw codedConflict('JOB_POSTING_NOT_OPEN');
    await tx.jobPosting.update({ where: { id: row.id }, data: { status: 'CLOSED', endedAt: now } });
    await withdrawJobPostingPoints(tx, row.id, now);
    return closeJobPostingOutputSchema.parse({ postingId: row.id, status: 'CLOSED' });
  });
}

/** Yazarın kendi ilanları (yeniden eskiye). Yazar rolü olmayan üye 403. */
export async function listMyJobPostings(
  deps: JobPostingDeps,
  userId: string,
  input: ListMyJobPostingsInput,
): Promise<MyJobPostingPage> {
  const parsed = listMyJobPostingsSchema.parse(input);
  return asMember(deps, userId, async (tx, actor) => {
    authorDepartmentIds(actor);
    const rows = await tx.jobPosting.findMany({
      where: {
        authorId: userId,
        ...(parsed.status ? { status: parsed.status } : {}),
        ...idCursorWhere(parsed.cursor),
      },
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
      select: MY_POSTING_SELECT,
    });
    const page = toPage(rows, parsed.limit);
    return myJobPostingPageSchema.parse({
      items: page.items.map(projectMyPosting),
      nextCursor: page.nextCursor,
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Doğrulanmış üye: arama, detay, şikâyet
// ---------------------------------------------------------------------------------------------

function toCard(
  row: Awaited<ReturnType<typeof searchJobPostingRows>>['rows'][number],
  today: string,
) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    organizationName: row.organizationName,
    companyId: row.companyId,
    location: row.location,
    isRemote: row.isRemote,
    deadlineOn: row.deadlineOn,
    daysLeft: daysLeft(row.deadlineOn, today),
    applyMethod: row.applyMethod,
    publishedAt: row.publishedAt,
    authorKind: row.authorKind,
    targetDepartments: row.targetDepartments,
  };
}

/** Arama/liste: yalnız arayanın üniversitesindeki, yayında ve süresi dolmamış ilanlar (K-07). */
export async function searchJobPostings(
  deps: JobPostingDeps,
  userId: string,
  input: SearchJobPostingsInput,
): Promise<JobPostingPage> {
  const parsed = searchJobPostingsSchema.parse(input);
  const now = nowOf(deps);
  const universityIds = await asMember(deps, userId, (tx, actor) => viewerUniversityIds(tx, actor));
  const today = istanbulDay(now);
  const { rows, total } = await searchJobPostingRows(deps.db, {
    universityIds,
    today,
    q: parsed.q,
    departmentId: parsed.departmentId,
    kind: parsed.kind,
    companyId: parsed.companyId,
    organizationName: parsed.organizationName,
    location: parsed.location,
    remote: parsed.remote,
    withinDays: parsed.withinDays,
    page: parsed.page,
    pageSize: parsed.pageSize,
  });
  // Kullanım olayı (P1-13): yalnız sonuç kovası; sorgu metni ve süzgeç değerleri yazılmaz.
  emitEvent(deps.db, userId, {
    type: 'JOB_POSTING_SEARCH',
    props: { results: resultBucketOf(total) },
  });
  return jobPostingPageSchema.parse({
    items: rows.map((row) => jobPostingCardSchema.parse(toCard(row, today))),
    total,
    page: parsed.page,
    pageSize: parsed.pageSize,
  });
}

/** Süzgeç seçenekleri: arayanın üniversitesindeki yayında ve süresi dolmamış ilanlardan türetilir (K-07; kişi verisi yok). */
export async function getJobPostingFilterOptions(
  deps: JobPostingDeps,
  userId: string,
  input: GetJobPostingFilterOptionsInput = {},
): Promise<JobPostingFilterOptions> {
  getJobPostingFilterOptionsSchema.parse(input);
  const today = istanbulDay(nowOf(deps));
  const universityIds = await asMember(deps, userId, (tx, actor) => viewerUniversityIds(tx, actor));
  return jobPostingFilterOptionsSchema.parse(
    await jobPostingFilterOptionRows(deps.db, {
      universityIds,
      today,
      limit: JOB_POSTING_FILTER_OPTIONS_LIMIT,
    }),
  );
}

/**
 * Okuyucu detayı. `applyUrl` yalnız `URL` yönteminde; `contactUserId` yalnız `CONTACT_REQUEST` yönteminde döner (D7). Kapsam dışı,
 * yayında olmayan ya da süresi dolmuş ilan `RESOURCE_NOT_FOUND` (varlık sızmaz).
 */
export async function getJobPosting(
  deps: JobPostingDeps,
  userId: string,
  input: GetJobPostingInput,
): Promise<JobPostingDetail> {
  const parsed = getJobPostingSchema.parse(input);
  const now = nowOf(deps);
  const today = istanbulDay(now);
  const row = await asMember(deps, userId, async (tx, actor) =>
    findJobPostingRow(tx, {
      universityIds: await viewerUniversityIds(tx, actor),
      today,
      id: parsed.id,
    }),
  );
  if (!row) throw codedNotFound('RESOURCE_NOT_FOUND');
  emitEvent(deps.db, userId, { type: 'JOB_POSTING_VIEWED', props: {} });
  return jobPostingDetailSchema.parse({
    ...toCard(row, today),
    description: row.description,
    applyUrl: row.applyMethod === 'URL' ? row.applyUrl : null,
    contactUserId: row.applyMethod === 'CONTACT_REQUEST' ? row.authorId : null,
  });
}

/** Şikâyet (raportör kimliği hiçbir çıktıda yok): yalnız açık (yayında, süresi dolmamış) ve görünür ilan; günlük 10, tek açık şikâyet. */
export async function reportJobPosting(
  deps: JobPostingDeps,
  userId: string,
  input: ReportJobPostingInput,
): Promise<ReportJobPostingOutput> {
  const parsed = reportJobPostingSchema.parse(input);
  return asMember(deps, userId, async (tx, actor, now) => {
    await tx.$queryRaw`SELECT "id" FROM "JobPosting" WHERE "id"=${parsed.postingId} FOR UPDATE`;
    const posting = await tx.jobPosting.findUnique({
      where: { id: parsed.postingId },
      select: {
        status: true,
        deadlineOn: true,
        department: { select: { faculty: { select: { universityId: true } } } },
      },
    });
    const universityIds = await viewerUniversityIds(tx, actor);
    // Kapsam dışı ve yayına hiç girmemiş ilanın varlığı sızmaz; kapsam içi ama açık olmayan `JOB_POSTING_NOT_OPEN`.
    if (
      !posting ||
      !universityIds.includes(posting.department.faculty.universityId) ||
      ['DRAFT', 'PENDING', 'REJECTED'].includes(posting.status)
    )
      throw codedNotFound('RESOURCE_NOT_FOUND');
    if (
      !isOpen(
        {
          status: posting.status,
          deadlineOn: posting.deadlineOn ? dayOfDateColumn(posting.deadlineOn) : null,
        },
        istanbulDay(now),
      )
    )
      throw codedConflict('JOB_POSTING_NOT_OPEN');
    const existing = await tx.jobPostingReport.findFirst({
      where: { postingId: parsed.postingId, reporterId: userId, status: 'OPEN' },
      select: { id: true },
    });
    if (existing) throw codedConflict('REPORT_ALREADY_OPEN');
    await consumeRateLimit(tx, RATE_LIMITS.jobPostingReport, userId, now);
    const report = await tx.jobPostingReport.create({
      data: { postingId: parsed.postingId, reporterId: userId, reason: parsed.reason },
      select: { id: true },
    });
    return reportJobPostingOutputSchema.parse({ reportId: report.id, status: 'OPEN' });
  });
}

// ---------------------------------------------------------------------------------------------
// Zamanlı iş: süresi dolan ilanları kapat (`postings.expire`; günlük, İstanbul)
// ---------------------------------------------------------------------------------------------

/**
 * Son başvuru günü geçen `PUBLISHED` ilanı `EXPIRED` yapar; incelemede (`PENDING`) bekleyen süresi dolmuş ilan da `EXPIRED` olur
 * (kuyrukta bekletilmez; yayına hiç girmemiştir). Taslak ve reddedilmiş ilan dokunulmaz (yazar düzenleyebilir). İdempotenttir:
 * ikinci çalıştırma bir şey bulmaz. Süresi dolan yazarlara bildirim gider (`jobPostingExpired`, outbox, aynı işlemde).
 */
export async function expireJobPostings(deps: JobPostingDeps): Promise<{ expired: number }> {
  const now = nowOf(deps);
  const today = istanbulDay(now);
  let expired = 0;
  for (;;) {
    const batch = await deps.db.jobPosting.findMany({
      where: { status: { in: ['PUBLISHED', 'PENDING'] }, deadlineOn: { lt: dayToDate(today) } },
      orderBy: { id: 'asc' },
      take: 100,
      select: { id: true },
    });
    if (batch.length === 0) break;
    let progressed = 0;
    for (const { id } of batch) {
      const done = await deps.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "JobPosting" WHERE "id"=${id} FOR UPDATE`;
        const row = await tx.jobPosting.findUnique({
          where: { id },
          select: { status: true, deadlineOn: true, authorId: true },
        });
        // Kilit sonrası yeniden denetim: arada yazar çekmiş ya da moderatör karar vermiş olabilir.
        if (
          !row ||
          !['PUBLISHED', 'PENDING'].includes(row.status) ||
          !row.deadlineOn ||
          dayOfDateColumn(row.deadlineOn) >= today
        )
          return false;
        await tx.jobPosting.update({ where: { id }, data: { status: 'EXPIRED', endedAt: now } });
        await stageNotification(tx, row.authorId, {
          type: 'generic',
          event: 'jobPostingExpired',
          eventId: id,
          path: '/ilanlarim',
        });
        return true;
      }, TX_OPTIONS);
      if (done) progressed += 1;
    }
    expired += progressed;
    // Kilit sonrası hiçbiri ilerlemediyse (hepsi arada değişti) döngüden çık: sonsuz döngü yok.
    if (progressed === 0) break;
  }
  return { expired };
}
