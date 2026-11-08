import 'server-only';

import {
  EMPLOYMENT_EXPORT_FILE_NAME,
  EMPLOYMENT_EXPORT_RATE_LIMIT,
  employmentReportFilterSchema,
  employmentReportSchema,
  type EmploymentReport,
  type EmploymentReportFilter,
} from '@/contracts/admin';
import type { Prisma } from '@/generated/prisma/client';

import {
  buildBuckets,
  pickRepresentativePosition,
  type PositionFacts,
  type RawGroup,
} from '../rules/employmentReport';
import {
  loadAnyAdmin,
  nowOf,
  readAsAdmin,
  TX_OPTIONS,
  type AdminDeps,
  type Tx,
} from './admin-access';
import { recordAdminAction } from './audit';
import { buildEmploymentWorkbook } from './employment-workbook';
import { consumeRateLimit, type RateLimitRule } from './rateLimit';
import { listManagedDepartmentIds } from '../permissions/scope';

/**
 * Mezun istihdam raporu ve Excel dışa aktarma (P1-11). Yalnız TOPLU sayılar: kişi satırı yoktur. Kapsam yöneticinin
 * bölümleriyle kesişir (süzgeçler yetki vermez). Sayım kuralı `EMPLOYMENT_COUNTING_RULE`; küçük hücre bastırma
 * `rules/employmentReport`. Eşleşmeyen serbest metin rapora girmez (yalnız `UNKNOWN` sayısı).
 */

const BATCH_SIZE = 1000;
const SCOPE_LABEL_NAMES_MAX = 5;

export const EMPLOYMENT_EXPORT_RULE: RateLimitRule = {
  name: 'employment-export',
  limit: EMPLOYMENT_EXPORT_RATE_LIMIT.maxRequests,
  windowMs: EMPLOYMENT_EXPORT_RATE_LIMIT.windowSeconds * 1000,
};

type ScopeInfo = { departmentIds: string[]; label: string };

/** Yönetici kapsamı ∩ istemci süzgeci (bölüm ya da fakülte). Kapsam dışı kimlik boş küme verir. */
async function resolveScope(
  tx: Tx,
  managedIds: readonly string[],
  filter: EmploymentReportFilter,
): Promise<ScopeInfo> {
  const departments = await tx.department.findMany({
    where: {
      id: { in: [...managedIds] },
      ...(filter.departmentId
        ? { id: { in: managedIds.filter((id) => id === filter.departmentId) } }
        : {}),
      ...(filter.facultyId ? { facultyId: filter.facultyId } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const names = departments.map((department) => department.name);
  const label =
    names.length === 0
      ? 'Kapsamda bölüm yok'
      : names.length <= SCOPE_LABEL_NAMES_MAX
        ? names.join(', ')
        : `${names.length} bölüm`;
  return { departmentIds: departments.map((department) => department.id), label };
}

type Counter = Map<string | null, { label: string | null; count: number }>;
function bump(counter: Counter, key: string | null, label: string | null) {
  const current = counter.get(key);
  if (current) current.count += 1;
  else counter.set(key, { label, count: 1 });
}
const groupsOf = (counter: Counter): RawGroup[] =>
  [...counter.entries()].map(([key, value]) => ({ key, label: value.label, count: value.count }));

async function computeReport(
  tx: Tx,
  scope: ScopeInfo,
  filter: EmploymentReportFilter,
  now: Date,
): Promise<EmploymentReport> {
  const membershipWhere: Prisma.MembershipWhereInput = {
    role: 'ALUMNI',
    verificationStatus: 'VERIFIED',
    departmentId: { in: scope.departmentIds },
    user: { deletedAt: null },
    ...(filter.graduationYearFrom !== undefined || filter.graduationYearTo !== undefined
      ? {
          graduationYear: {
            ...(filter.graduationYearFrom !== undefined ? { gte: filter.graduationYearFrom } : {}),
            ...(filter.graduationYearTo !== undefined ? { lte: filter.graduationYearTo } : {}),
          },
        }
      : {}),
  };

  let totalAlumni = 0;
  let alumniWithPosition = 0;
  const sectors: Counter = new Map();
  const titles: Counter = new Map();
  const companies: Counter = new Map();
  const sectorNames = new Map<string, string>();

  let after: string | undefined;
  for (;;) {
    // Kişi bir kez sayılır: birden çok mezun üyeliği olsa da kullanıcı kimliğine göre tekilleşir.
    const users = await tx.membership.groupBy({
      by: ['userId'],
      where: { ...membershipWhere, ...(after ? { userId: { gt: after } } : {}) },
      orderBy: { userId: 'asc' },
      take: BATCH_SIZE,
    });
    if (users.length === 0) break;
    after = users.at(-1)?.userId;
    totalAlumni += users.length;

    const rows = await tx.position.findMany({
      where: { userId: { in: users.map((user) => user.userId) } },
      select: {
        id: true,
        userId: true,
        isCurrent: true,
        startYear: true,
        startMonth: true,
        endYear: true,
        endMonth: true,
        companyId: true,
        titleId: true,
        sectorId: true,
        company: { select: { name: true, sectorId: true } },
        title: { select: { name: true } },
        sector: { select: { name: true } },
      },
    });
    const byUser = new Map<string, typeof rows>();
    for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);

    for (const userRows of byUser.values()) {
      const facts: (PositionFacts & { source: (typeof rows)[number] })[] = userRows.map((row) => ({
        id: row.id,
        isCurrent: row.isCurrent,
        startYear: row.startYear,
        startMonth: row.startMonth,
        endYear: row.endYear,
        endMonth: row.endMonth,
        companyId: row.companyId,
        titleId: row.titleId,
        sectorId: row.sectorId ?? row.company?.sectorId ?? null,
        source: row,
      }));
      const picked = pickRepresentativePosition(facts);
      if (!picked) continue;
      alumniWithPosition += 1;
      bump(companies, picked.companyId, picked.source.company?.name ?? null);
      bump(titles, picked.titleId, picked.source.title?.name ?? null);
      bump(sectors, picked.sectorId, null);
      if (picked.sectorId !== null && picked.source.sector?.name) {
        sectorNames.set(picked.sectorId, picked.source.sector.name);
      }
    }
    if (users.length < BATCH_SIZE) break;
  }

  // Sektör adları: pozisyonun kendi sektörü ya da şirketinin sektörü; ad toplu çözülür.
  const unnamed = [...sectors.keys()].filter(
    (key): key is string => key !== null && !sectorNames.has(key),
  );
  if (unnamed.length > 0) {
    for (const sector of await tx.sector.findMany({
      where: { id: { in: unnamed } },
      select: { id: true, name: true },
    })) {
      sectorNames.set(sector.id, sector.name);
    }
  }
  for (const [key, value] of sectors) {
    if (key !== null) value.label = sectorNames.get(key) ?? null;
  }

  return employmentReportSchema.parse({
    generatedAt: now,
    minGroupSize: 3,
    totalAlumni,
    alumniWithPosition,
    distributions: {
      SECTOR: buildBuckets(groupsOf(sectors)),
      TITLE: buildBuckets(groupsOf(titles)),
      COMPANY: buildBuckets(groupsOf(companies)),
    },
  });
}

export async function getEmploymentReport(
  deps: AdminDeps,
  adminUserId: string,
  input: EmploymentReportFilter,
): Promise<EmploymentReport> {
  const filter = employmentReportFilterSchema.parse(input);
  return readAsAdmin(deps, adminUserId, 'ANY_ADMIN', async ({ tx, now, departmentIds }) => {
    const scope = await resolveScope(tx, departmentIds, filter);
    return computeReport(tx, scope, filter, now);
  });
}

export type EmploymentExport = { bytes: Uint8Array; fileName: string };

/**
 * Excel dışa aktarma: yetki, hız sınırı, rapor, dosya ve `DATA_EXPORT` işlem kaydı TEK işlemde. Kayıt yazılamazsa
 * ya da dosya üretilemezse hiçbir şey teslim edilmez. Kayıt metadata'sı yalnız kapsam kimlik sayısı ve yıllardır.
 */
export async function exportEmploymentReport(
  deps: AdminDeps,
  adminUserId: string,
  input: EmploymentReportFilter,
): Promise<EmploymentExport> {
  const filter = employmentReportFilterSchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await loadAnyAdmin(tx, adminUserId, now);
    await consumeRateLimit(tx, EMPLOYMENT_EXPORT_RULE, adminUserId, now);
    const managedIds = await listManagedDepartmentIds(tx, actor.facts);
    const scope = await resolveScope(tx, managedIds, filter);
    const report = await computeReport(tx, scope, filter, now);
    const bytes = await buildEmploymentWorkbook(report, {
      scopeLabel: scope.label,
      graduationYearFrom: filter.graduationYearFrom,
      graduationYearTo: filter.graduationYearTo,
    });
    await recordAdminAction(tx, {
      actor,
      action: 'DATA_EXPORT',
      targetType: 'EMPLOYMENT_REPORT',
      targetId: filter.departmentId ?? filter.facultyId ?? 'ALL',
      metadata: {
        scopeDepartmentCount: scope.departmentIds.length,
        graduationYearFrom: filter.graduationYearFrom ?? null,
        graduationYearTo: filter.graduationYearTo ?? null,
        totalAlumni: report.totalAlumni,
      },
    });
    return { bytes, fileName: EMPLOYMENT_EXPORT_FILE_NAME };
  }, TX_OPTIONS);
}
