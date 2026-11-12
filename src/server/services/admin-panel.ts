import 'server-only';

import {
  adminOverviewSchema,
  adminReportPageSchema,
  auditLogPageSchema,
  listAdminReportsSchema,
  listAuditLogSchema,
  type AdminOverview,
  type AdminReportPage,
  type AuditLogPage,
  type ListAdminReportsInput,
  type ListAuditLogInput,
} from '@/contracts/admin';
import {
  adminGrantPageSchema,
  adminUserDetailSchema,
  adminUserPageSchema,
  getUserDetailSchema,
  listAdminGrantsSchema,
  searchUsersSchema,
  type AdminGrantPage,
  type AdminUserDetail,
  type AdminUserPage,
  type GetUserDetailInput,
  type ListAdminGrantsInput,
  type SearchUsersInput,
} from '@/contracts/admin-users';
import type { Prisma } from '@/generated/prisma/client';
import { codedForbidden, codedNotFound } from '@/lib/errors';
import { jobPostingReportScopeWhere } from './job-posting-report-scope';

import { looksLikePersonalData } from '../rules/adminAudit';
import { accountStatusOf } from '../rules/authorization';
import { maskEmail } from '../rules/maskEmail';
import { maskPhone } from '../rules/maskPhone';
import {
  idCursorWhere,
  intersectDepartments,
  readAsAdmin,
  toPage,
  type AdminDeps,
  type Tx,
} from './admin-access';

/**
 * Yönetim paneli OKUMA servisleri (P1-11): genel bakış, kullanıcı arama/ayrıntı, şikâyet kuyruğu, yönetici
 * atamaları, işlem kaydı görüntüleme. Her çağrı yetkiyi işlemin içinde yeniden yükler; sorgular yöneticinin
 * kapsamıyla KESİŞİR (istemci süzgeçleri yetki vermez). Çıktılar sözleşme şemasından geçirilir: telefon/e-posta
 * yalnız maskeli, ham alan çıktıya girmez (şemalar `strict`).
 */

const DELETED_NAME = 'Silinmiş hesap';

/** `LIKE` özel karakterleri (`%`, `_`, `\`) düz metin sayılır: Prisma `contains` bunları kendisi kaçırmaz. */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

type Scope = { departmentIds: string[]; system: boolean };

/** Hesap geneli askı: `accountStatusOf` ile aynı kural (süresi dolmuş askı askı değildir). */
const suspendedWhere = (now: Date): Prisma.UserWhereInput => ({
  banned: true,
  OR: [{ banExpires: null }, { banExpires: { gt: now } }],
});

// ---------------------------------------------------------------------------------------------
// Genel bakış
// ---------------------------------------------------------------------------------------------

export async function getAdminOverview(
  deps: AdminDeps,
  adminUserId: string,
): Promise<AdminOverview> {
  return readAsAdmin(
    deps,
    adminUserId,
    'ANY_ADMIN',
    async ({ tx, actor, now, departmentIds, system }) => {
      const grants = actor.facts.grants.filter((grant) => grant.revokedAt === null);
      const level = system
        ? 'SYSTEM'
        : grants.some((grant) => grant.scope === 'FACULTY')
          ? 'FACULTY'
          : 'DEPARTMENT';

      const departments = await tx.department.findMany({
        where: { id: { in: departmentIds } },
        select: {
          id: true,
          name: true,
          faculty: { select: { id: true, name: true } },
        },
        orderBy: [{ faculty: { name: 'asc' } }, { name: 'asc' }],
      });

      const userScope: Prisma.UserWhereInput = system
        ? {}
        : { memberships: { some: { endedAt: null, departmentId: { in: departmentIds } } } };
      const [
        pendingGraduationDocuments,
        pendingExperiences,
        pendingFaqRequests,
        pendingJobPostings,
        pendingReferrals,
        pendingCampusEvents,
        pendingAlumniStoriesRows,
        openExperienceReports,
        openJobReports,
        suspendedUsers,
        unmatched,
      ] = await Promise.all([
        tx.graduationDocument.count({
          where: { status: 'PENDING', departmentId: { in: departmentIds } },
        }),
        tx.experience.count({
          where: { status: 'PENDING', departmentIdAtWrite: { in: departmentIds } },
        }),
        tx.faqRequest.count({
          where: { status: 'OPEN', departmentIdAtWrite: { in: departmentIds } },
        }),
        tx.jobPosting.count({
          where: { status: 'PENDING', departmentIdAtWrite: { in: departmentIds } },
        }),
        tx.referralClaim.count({
          where: {
            status: { in: ['STUDENT_CONFIRMED', 'ACCEPTED_ALUMNI_CONFIRMED'] },
            departmentIdAtWrite: { in: departmentIds },
          },
        }),
        tx.campusEvent.count({
          where: {
            status: 'PENDING',
            departments: {
              some: { departmentId: { in: departmentIds } },
              every: { departmentId: { in: departmentIds } },
            },
          },
        }),
        // Bölüm başına OR, Prisma'da bölüm başına User JOIN'i üretir; sistem kapsamında plan şişer.
        // Üyelik aynı hikâye bölümüne bağlı EXISTS ile doğrulanır: JOIN sayısı kapsamdan bağımsızdır.
        tx.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) AS "count"
          FROM "AlumniStory" AS s
          JOIN "User" AS u ON u."id" = s."userId"
          WHERE s."status" = 'PENDING'
            AND s."departmentId" = ANY(${departmentIds}::text[])
            AND u."deletedAt" IS NULL
            AND (u."banned" = false OR u."banExpires" <= ${now})
            AND EXISTS (
              SELECT 1 FROM "Membership" AS m
              WHERE m."userId" = s."userId" AND m."departmentId" = s."departmentId"
                AND m."role" = 'ALUMNI' AND m."verificationStatus" = 'VERIFIED'
                AND m."endedAt" IS NULL
            )
        `,
        tx.report.count({
          where: { status: 'OPEN', target: { departmentIdAtWrite: { in: departmentIds } } },
        }),
        tx.jobPostingReport.count({
          where: jobPostingReportScopeWhere(departmentIds, 'OPEN'),
        }),
        tx.user.count({ where: { deletedAt: null, ...suspendedWhere(now), ...userScope } }),
        system ? tx.unmatchedValue.count({ where: openUnmatchedWhere }) : Promise.resolve(null),
      ]);

      return adminOverviewSchema.parse({
        level,
        departments: departments.map((department) => ({
          id: department.id,
          name: department.name,
          facultyId: department.faculty.id,
          facultyName: department.faculty.name,
        })),
        capabilities: {
          users: true,
          reports: true,
          employmentReport: true,
          dictionaries: system,
          unmatchedValues: system,
          adminGrants: system,
          auditLog: system,
        },
        counts: {
          pendingGraduationDocuments,
          pendingExperiences,
          pendingFaqRequests,
          pendingJobPostings,
          pendingReferrals,
          pendingCampusEvents,
          pendingAlumniStories: Number(pendingAlumniStoriesRows[0]!.count),
          openReports: openExperienceReports + openJobReports,
          suspendedUsers,
          openUnmatchedValues: unmatched,
        },
      });
    },
  );
}

export const openUnmatchedWhere = {
  resolvedToId: null,
  dismissedAt: null,
} satisfies Prisma.UnmatchedValueWhereInput;

// ---------------------------------------------------------------------------------------------
// Kullanıcılar
// ---------------------------------------------------------------------------------------------

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  banned: true,
  banReason: true,
  banExpires: true,
  deletedAt: true,
  createdAt: true,
  memberships: {
    select: {
      id: true,
      departmentId: true,
      role: true,
      verificationStatus: true,
      entryYear: true,
      graduationYear: true,
      endedAt: true,
      department: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  },
  adminGrants: { where: { revokedAt: null }, select: { id: true } },
  mentorProfile: { select: { isActive: true } },
} satisfies Prisma.UserSelect;
type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

/** Kullanıcı bu kapsamda görünür mü? Sistem yöneticisi herkesi, diğerleri kapsamda ETKİN üyeliği olanı görür. */
const isVisible = (row: UserRow, scope: Scope) =>
  scope.system ||
  row.memberships.some(
    (membership) =>
      membership.endedAt === null && scope.departmentIds.includes(membership.departmentId),
  );

function projectUser(row: UserRow, scope: Scope, actorId: string, now: Date) {
  const inScope = (departmentId: string) =>
    scope.system || scope.departmentIds.includes(departmentId);
  const active = row.memberships.filter((membership) => membership.endedAt === null);
  const isAdmin = row.adminGrants.length > 0;
  const manageable =
    row.id !== actorId &&
    (scope.system ||
      (active.length > 0 &&
        active.every((membership) => inScope(membership.departmentId)) &&
        !isAdmin));
  return {
    id: row.id,
    displayName: row.name,
    maskedEmail: maskEmail(row.email),
    maskedPhone: row.phone ? maskPhone(row.phone) : null,
    status:
      accountStatusOf(row, now) === 'SUSPENDED' ? ('SUSPENDED' as const) : ('ACTIVE' as const),
    // Kapsam dışı geçmiş (kapanmış) üyelik görünmez; etkin olanlar bilgi olarak görünür (`inScope` işaretli).
    memberships: row.memberships
      .filter((membership) => membership.endedAt === null || inScope(membership.departmentId))
      .map((membership) => ({
        id: membership.id,
        departmentId: membership.departmentId,
        departmentName: membership.department.name,
        role: membership.role,
        verificationStatus: membership.verificationStatus,
        active: membership.endedAt === null,
        entryYear: membership.entryYear,
        graduationYear: membership.graduationYear,
        inScope: inScope(membership.departmentId),
      })),
    isAdmin,
    mentorActive: row.mentorProfile?.isActive ?? false,
    manageable,
  };
}

export async function searchUsers(
  deps: AdminDeps,
  adminUserId: string,
  input: SearchUsersInput,
): Promise<AdminUserPage> {
  const parsed = searchUsersSchema.parse(input);
  return readAsAdmin(deps, adminUserId, 'ANY_ADMIN', async ({ tx, now, departmentIds, system }) => {
    const scope: Scope = { departmentIds, system };
    const membershipFilter = parsed.role !== undefined || parsed.verificationStatus !== undefined;
    const requestedDepartments = intersectDepartments(departmentIds, parsed.departmentId);

    const and: Prisma.UserWhereInput[] = [{ deletedAt: null }, idCursorWhere(parsed.cursor)];
    // Süzgeçler yetki vermez: bölüm kümesi her zaman yönetici kapsamıyla kesişir (`intersectDepartments`).
    if (!system || parsed.departmentId !== undefined || membershipFilter) {
      and.push({
        memberships: {
          some: {
            endedAt: null,
            ...(system && parsed.departmentId === undefined
              ? {}
              : { departmentId: { in: requestedDepartments } }),
            ...(parsed.role ? { role: parsed.role } : {}),
            ...(parsed.verificationStatus ? { verificationStatus: parsed.verificationStatus } : {}),
          },
        },
      });
    }
    if (parsed.status === 'SUSPENDED') and.push(suspendedWhere(now));
    if (parsed.status === 'ACTIVE') and.push({ NOT: suspendedWhere(now) });
    if (parsed.query) {
      and.push({
        OR: [
          { name: { contains: escapeLike(parsed.query), mode: 'insensitive' } },
          { email: { contains: escapeLike(parsed.query), mode: 'insensitive' } },
        ],
      });
    }

    const rows = await tx.user.findMany({
      where: { AND: and },
      select: userSelect,
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
    });
    const result = toPage(rows, parsed.limit);
    return adminUserPageSchema.parse({
      items: result.items.map((row) => projectUser(row, scope, adminUserId, now)),
      nextCursor: result.nextCursor,
    });
  });
}

export async function getUserDetail(
  deps: AdminDeps,
  adminUserId: string,
  input: GetUserDetailInput,
): Promise<AdminUserDetail> {
  const parsed = getUserDetailSchema.parse(input);
  return readAsAdmin(deps, adminUserId, 'ANY_ADMIN', async ({ tx, now, departmentIds, system }) => {
    const scope: Scope = { departmentIds, system };
    const row = await tx.user.findFirst({
      where: { id: parsed.userId, deletedAt: null },
      select: userSelect,
    });
    // Sistem dışı yöneticide var olmayan ile kapsam dışı ayırt edilmez (varlık sızmaz).
    if (!row || !isVisible(row, scope)) {
      throw system ? codedNotFound('RESOURCE_NOT_FOUND') : codedForbidden('AUTH_FORBIDDEN');
    }
    const summary = projectUser(row, scope, adminUserId, now);
    return adminUserDetailSchema.parse({
      ...summary,
      createdAt: row.createdAt,
      suspension: {
        suspended: summary.status === 'SUSPENDED',
        reason: summary.status === 'SUSPENDED' ? row.banReason : null,
        expiresAt: summary.status === 'SUSPENDED' ? row.banExpires : null,
      },
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Şikâyet kuyruğu
// ---------------------------------------------------------------------------------------------

export async function listAdminReports(
  deps: AdminDeps,
  adminUserId: string,
  input: ListAdminReportsInput,
): Promise<AdminReportPage> {
  const parsed = listAdminReportsSchema.parse(input);
  return readAsAdmin(deps, adminUserId, 'ANY_ADMIN', async ({ tx, departmentIds }) => {
    const ids = intersectDepartments(departmentIds, parsed.departmentId);
    const rows = await tx.report.findMany({
      where: {
        status: parsed.status,
        target: { departmentIdAtWrite: { in: ids } },
        ...idCursorWhere(parsed.cursor),
      },
      select: {
        id: true,
        status: true,
        reason: true,
        createdAt: true,
        reviewedAt: true,
        resolutionNote: true,
        target: {
          select: {
            id: true,
            type: true,
            organizationName: true,
            isAnonymous: true,
            departmentIdAtWrite: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
    });
    const result = toPage(rows, parsed.limit);
    const counts = await openReportCounts(tx, [
      ...new Set(result.items.map((row) => row.target.id)),
    ]);
    return adminReportPageSchema.parse({
      items: result.items.map((row) => ({
        id: row.id,
        status: row.status,
        reason: row.reason,
        createdAt: row.createdAt,
        reviewedAt: row.reviewedAt,
        resolutionNote: row.resolutionNote,
        target: {
          type: 'EXPERIENCE',
          id: row.target.id,
          experienceType: row.target.type,
          organizationName: row.target.organizationName,
          isAnonymous: row.target.isAnonymous,
          departmentId: row.target.departmentIdAtWrite,
          departmentName: row.target.department.name,
          openReportCount: counts.get(row.target.id) ?? 0,
        },
      })),
      nextCursor: result.nextCursor,
    });
  });
}

async function openReportCounts(tx: Tx, targetIds: string[]): Promise<Map<string, number>> {
  if (targetIds.length === 0) return new Map();
  const groups = await tx.report.groupBy({
    by: ['targetId'],
    where: { targetId: { in: targetIds }, status: 'OPEN' },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.targetId, group._count._all]));
}

// ---------------------------------------------------------------------------------------------
// Yönetici atamaları (yalnız sistem yöneticisi)
// ---------------------------------------------------------------------------------------------

export async function listAdminGrants(
  deps: AdminDeps,
  adminUserId: string,
  input: ListAdminGrantsInput,
): Promise<AdminGrantPage> {
  const parsed = listAdminGrantsSchema.parse(input);
  return readAsAdmin(deps, adminUserId, 'SYSTEM_ONLY', async ({ tx }) => {
    const rows = await tx.adminGrant.findMany({
      where: { revokedAt: parsed.active ? null : { not: null }, ...idCursorWhere(parsed.cursor) },
      select: {
        id: true,
        userId: true,
        scope: true,
        facultyId: true,
        departmentId: true,
        createdAt: true,
        revokedAt: true,
        user: { select: { name: true, email: true } },
        faculty: { select: { name: true } },
        department: { select: { name: true } },
        grantedBy: { select: { name: true } },
      },
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
    });
    const result = toPage(rows, parsed.limit);
    return adminGrantPageSchema.parse({
      items: result.items.map((row) => ({
        id: row.id,
        userId: row.userId,
        userDisplayName: row.user.name,
        maskedEmail: maskEmail(row.user.email),
        scope: row.scope,
        facultyId: row.facultyId,
        facultyName: row.faculty?.name ?? null,
        departmentId: row.departmentId,
        departmentName: row.department?.name ?? null,
        grantedAt: row.createdAt,
        grantedByName: row.grantedBy.name,
        revokedAt: row.revokedAt,
      })),
      nextCursor: result.nextCursor,
    });
  });
}

// ---------------------------------------------------------------------------------------------
// İşlem kaydı görüntüleme (yalnız sistem yöneticisi; kayıt yalnız eklenir)
// ---------------------------------------------------------------------------------------------

const REDACTED = '[gizlendi]';

/**
 * Yazımda kişisel veri reddedilir; yine de okumada son bir ağ: kişisel veri gibi görünen her metin gizlenir
 * (eski ya da elle eklenmiş satır, ihlalde bile ham değer panele çıkmaz).
 */
export function redactAuditText(value: string): string {
  return looksLikePersonalData(value) ? REDACTED : value;
}
function redactMetadataValue(value: unknown): unknown {
  if (typeof value === 'string') return redactAuditText(value);
  if (typeof value === 'number' && looksLikePersonalData(String(value))) return REDACTED;
  if (Array.isArray(value)) return value.map(redactMetadataValue);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        redactAuditText(key),
        redactMetadataValue(entry),
      ]),
    );
  return value;
}
function redactMetadata(metadata: unknown): Record<string, unknown> {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return redactMetadataValue(metadata) as Record<string, unknown>;
}

export async function listAuditLog(
  deps: AdminDeps,
  adminUserId: string,
  input: ListAuditLogInput,
): Promise<AuditLogPage> {
  const parsed = listAuditLogSchema.parse(input);
  return readAsAdmin(deps, adminUserId, 'SYSTEM_ONLY', async ({ tx }) => {
    const createdAt: Prisma.DateTimeFilter = {};
    if (parsed.from) createdAt.gte = parsed.from;
    if (parsed.to) createdAt.lte = parsed.to;
    const rows = await tx.adminAuditLog.findMany({
      where: {
        ...(parsed.action ? { action: parsed.action } : {}),
        ...(parsed.targetType ? { targetType: parsed.targetType } : {}),
        ...(parsed.targetId ? { targetId: parsed.targetId } : {}),
        ...(parsed.actorId ? { actorId: parsed.actorId } : {}),
        ...(parsed.from || parsed.to ? { createdAt } : {}),
        ...idCursorWhere(parsed.cursor),
      },
      select: {
        id: true,
        actorId: true,
        action: true,
        targetType: true,
        targetId: true,
        reason: true,
        metadata: true,
        createdAt: true,
        actor: { select: { name: true, deletedAt: true } },
      },
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
    });
    const result = toPage(rows, parsed.limit);
    return auditLogPageSchema.parse({
      items: result.items.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorName: row.actor.deletedAt ? DELETED_NAME : row.actor.name,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason === null ? null : redactAuditText(row.reason),
        metadata: redactMetadata(row.metadata),
        createdAt: row.createdAt,
      })),
      nextCursor: result.nextCursor,
    });
  });
}
