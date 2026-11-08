import 'server-only';

import ExcelJS from 'exceljs';

import {
  EVENT_TYPES,
  USAGE_EXPORT_FILE_NAME,
  USAGE_EXPORT_RATE_LIMIT,
  USAGE_EXPORT_SHEETS,
  usageMetricsFilterSchema,
  usageMetricsSchema,
  type EventType,
  type UsageMetrics,
  type UsageMetricsFilter,
} from '@/contracts/metrics';
import { REPORT_MIN_GROUP_SIZE } from '@/contracts/admin';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';

import { loadActor, type Actor } from '../permissions/actor';
import { errorForDenyReason } from '../permissions/guards';
import { listManagedDepartmentIds } from '../permissions/scope';
import { describeManagedScope, evaluateAccess } from '../rules/authorization';
import { recordAdminAction } from './audit';
import { consumeRateLimit, type RateLimitRule } from './rateLimit';

/**
 * Kullanım metrikleri panel sorguları ve Excel (P1-13). Yetki işlemin içinde güncel veriyle yeniden yüklenir; her sorgu
 * yöneticinin kapsamıyla KESİŞİR (`departmentId`/`facultyId` süzgeçleri yetki vermez; kapsam dışı bölümün olayı yoktur).
 * Küçük hücre bastırma: ayrı kullanıcı sayısı eşiğin altındaki (tür × rol × bölüm) hücreler tür başına `OTHER`'da birleşir.
 * Yönetici yardımcıları (#32 `admin-access`) main'e girince `readScoped` oraya bağlanır; davranış aynıdır.
 */
export type UsageDeps = { db: PrismaClient; now?: () => Date };
type Tx = Prisma.TransactionClient;
const nowOf = (deps: UsageDeps) => (deps.now ?? (() => new Date()))();
const TX = { timeout: 20_000, maxWait: 10_000 } as const;

type Scope = { actor: Actor; system: boolean; departmentIds: string[] };

async function loadScope(tx: Tx, adminUserId: string, now: Date): Promise<Scope> {
  const actor = await loadActor(tx, adminUserId, now);
  const decision = evaluateAccess(actor?.facts ?? null, { action: 'adminAny' });
  if (!decision.allowed || !actor) {
    throw errorForDenyReason(decision.allowed ? 'UNAUTHENTICATED' : decision.reason);
  }
  return {
    actor,
    system: describeManagedScope(actor.facts.grants).system,
    departmentIds: await listManagedDepartmentIds(tx, actor.facts),
  };
}

/** İstemci süzgeci ile yönetici kapsamının kesişimi; `null` = kısıtsız (yalnız sistem yöneticisi, süzgeçsiz). */
async function effectiveDepartments(
  tx: Tx,
  scope: Scope,
  filter: { departmentId?: string | undefined; facultyId?: string | undefined },
): Promise<string[] | null> {
  if (scope.system && !filter.departmentId && !filter.facultyId) return null;
  let ids = scope.departmentIds;
  if (filter.departmentId) ids = ids.filter((id) => id === filter.departmentId);
  if (filter.facultyId) {
    const inFaculty = await tx.department.findMany({
      where: { facultyId: filter.facultyId, id: { in: ids } },
      select: { id: true },
    });
    ids = inFaculty.map((row) => row.id);
  }
  return ids;
}

type Row = {
  type: EventType;
  role: 'STUDENT' | 'ALUMNI' | 'ACADEMIC' | null;
  departmentId: string | null;
  userId: string | null;
  events: number;
};

async function computeUsage(
  tx: Tx,
  scope: Scope,
  filter: ReturnType<typeof usageMetricsFilterSchema.parse>,
): Promise<{ metrics: UsageMetrics; scopeDepartmentCount: number | null }> {
  const departments = await effectiveDepartments(tx, scope, filter);
  const where: Prisma.EventWhereInput = {
    createdAt: { gte: filter.from, lt: filter.to },
    ...(filter.types ? { type: { in: filter.types } } : {}),
    ...(departments ? { departmentId: { in: departments } } : {}),
  };
  const groups = await tx.event.groupBy({
    by: ['type', 'role', 'departmentId', 'userId'],
    where,
    _count: { _all: true },
  });
  const rows: Row[] = groups.map((group) => ({
    type: group.type,
    role: group.role,
    departmentId: group.departmentId,
    userId: group.userId,
    events: group._count._all,
  }));

  const types = filter.types ?? [...EVENT_TYPES];
  const totals = new Map<EventType, number>(types.map((type) => [type, 0]));
  for (const row of rows) totals.set(row.type, (totals.get(row.type) ?? 0) + row.events);

  const allUsers = new Set(rows.flatMap((row) => (row.userId ? [row.userId] : [])));

  type Cell = {
    type: EventType;
    role: Row['role'];
    departmentId: string | null;
    events: number;
    users: Set<string>;
  };
  const cells = new Map<string, Cell>();
  for (const row of rows) {
    const key = `${row.type}|${row.role ?? ''}|${row.departmentId ?? ''}`;
    const cell = cells.get(key) ?? {
      type: row.type,
      role: row.role,
      departmentId: row.departmentId,
      events: 0,
      users: new Set(),
    };
    cell.events += row.events;
    if (row.userId) cell.users.add(row.userId);
    cells.set(key, cell);
  }
  const named: Cell[] = [];
  const others = new Map<EventType, Cell>();
  for (const cell of cells.values()) {
    if (cell.users.size >= REPORT_MIN_GROUP_SIZE) named.push(cell);
    else {
      const merged = others.get(cell.type) ?? {
        type: cell.type,
        role: null,
        departmentId: null,
        events: 0,
        users: new Set<string>(),
      };
      merged.events += cell.events;
      for (const user of cell.users) merged.users.add(user);
      others.set(cell.type, merged);
    }
  }
  const visibleOthers = [...others.values()].filter(
    (cell) => cell.users.size >= REPORT_MIN_GROUP_SIZE,
  );

  const names = new Map(
    (
      await tx.department.findMany({
        where: {
          id: {
            in: [
              ...new Set(
                named.map((cell) => cell.departmentId).filter((id): id is string => id !== null),
              ),
            ],
          },
        },
        select: { id: true, name: true },
      })
    ).map((department) => [department.id, department.name]),
  );
  const order = new Map(EVENT_TYPES.map((type, index) => [type, index]));
  const sortCells = (list: Cell[]) =>
    [...list].sort(
      (a, b) =>
        (order.get(a.type) ?? 0) - (order.get(b.type) ?? 0) ||
        b.events - a.events ||
        (a.role ?? '').localeCompare(b.role ?? '') ||
        (a.departmentId ?? '').localeCompare(b.departmentId ?? ''),
    );

  const metrics = usageMetricsSchema.parse({
    from: filter.from,
    to: filter.to,
    minGroupSize: REPORT_MIN_GROUP_SIZE,
    totalsByType: types.map((type) => ({ type, events: totals.get(type) ?? 0 })),
    activeUsers: allUsers.size >= REPORT_MIN_GROUP_SIZE ? allUsers.size : null,
    cells: [
      ...sortCells(named).map((cell) => ({
        kind: 'NAMED' as const,
        type: cell.type,
        role: cell.role,
        departmentId: cell.departmentId,
        departmentName: cell.departmentId ? (names.get(cell.departmentId) ?? null) : null,
        events: cell.events,
        users: cell.users.size,
      })),
      ...sortCells(visibleOthers).map((cell) => ({
        kind: 'OTHER' as const,
        type: cell.type,
        role: null,
        departmentId: null,
        departmentName: null,
        events: cell.events,
        users: cell.users.size,
      })),
    ],
  });
  return { metrics, scopeDepartmentCount: departments ? departments.length : null };
}

export async function getUsageMetrics(
  deps: UsageDeps,
  adminUserId: string,
  input: UsageMetricsFilter,
): Promise<UsageMetrics> {
  const filter = usageMetricsFilterSchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const scope = await loadScope(tx, adminUserId, now);
    return (await computeUsage(tx, scope, filter)).metrics;
  }, TX);
}

// ---------------------------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------------------------

export const USAGE_EXPORT_RULE: RateLimitRule = {
  name: 'usage-export',
  limit: USAGE_EXPORT_RATE_LIMIT.maxRequests,
  windowMs: USAGE_EXPORT_RATE_LIMIT.windowSeconds * 1000,
};

const ROLE_LABEL = { STUDENT: 'Öğrenci', ALUMNI: 'Mezun', ACADEMIC: 'Akademisyen' } as const;
export const EVENT_LABEL: Record<EventType, string> = {
  LOGIN: 'Giriş',
  PROFILE_THRESHOLD: 'Profil eşiği',
  CV_UPLOADED: 'CV yüklendi',
  CV_APPLIED: 'CV uygulandı',
  EXPERIENCE_PUBLISHED: 'Deneyim yayınlandı',
  SEARCH: 'Deneyim araması',
  MENTOR_SEARCH: 'Mentor araması',
  MENTOR_VIEWED: 'Mentor profili görüntülendi',
  APPOINTMENT_REQUESTED: 'Randevu talebi',
  APPOINTMENT_CONFIRMED: 'Randevu onayı',
  APPOINTMENT_COMPLETED: 'Randevu gerçekleşti',
  FAQ_REQUESTED: 'SSS talebi',
  FAQ_PUBLISHED: 'SSS yayınlandı',
  CV_REVIEW_REQUESTED: 'CV inceleme talebi',
  CONTACT_REQUESTED: 'İletişim talebi',
};

/** Toplu rapor `.xlsx` olur; yalnız sayılar: kişi satırı, e-posta, ad ya da kimlik yoktur. Hücreler düz metin/sayıdır. */
export async function buildUsageWorkbook(
  metrics: UsageMetrics,
  scopeLabel: string,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MezunPortal';
  workbook.created = metrics.to;
  for (const definition of USAGE_EXPORT_SHEETS) {
    const sheet = workbook.addWorksheet(definition.name);
    sheet.addRow([...definition.columns]);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    if (definition.name === 'Özet') {
      sheet.addRows([
        ['Başlangıç (dahil)', metrics.from.toISOString()],
        ['Bitiş (hariç)', metrics.to.toISOString()],
        ['Kapsam', scopeLabel],
        ['Etkin kullanıcı sayısı', metrics.activeUsers ?? `${metrics.minGroupSize} kişiden az`],
        ['Küçük grup eşiği', metrics.minGroupSize],
        [
          'Not',
          `Ayrı kullanıcı sayısı ${metrics.minGroupSize}'ün altındaki hücreler "Diğer"de birleşir ya da gösterilmez.`,
        ],
      ]);
    } else if (definition.name === 'Olay türü') {
      for (const total of metrics.totalsByType)
        sheet.addRow([EVENT_LABEL[total.type], total.events]);
    } else {
      for (const cell of metrics.cells) {
        sheet.addRow([
          EVENT_LABEL[cell.type],
          cell.kind === 'OTHER'
            ? 'Diğer (küçük gruplar)'
            : cell.role
              ? ROLE_LABEL[cell.role]
              : 'Rolsüz',
          cell.kind === 'OTHER' ? '' : (cell.departmentName ?? 'Bölümsüz'),
          cell.events,
          cell.users,
        ]);
      }
    }
    sheet.columns = definition.columns.map(() => ({ width: 28 }));
  }
  return new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}

/** Yetki + hız sınırı + sorgu + dosya + `DATA_EXPORT` kaydı TEK işlemde; hata hiçbir şey teslim etmez. */
export async function exportUsageMetrics(
  deps: UsageDeps,
  adminUserId: string,
  input: UsageMetricsFilter,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const filter = usageMetricsFilterSchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const scope = await loadScope(tx, adminUserId, now);
    await consumeRateLimit(tx, USAGE_EXPORT_RULE, adminUserId, now);
    const { metrics, scopeDepartmentCount } = await computeUsage(tx, scope, filter);
    const label = scopeDepartmentCount === null ? 'Tüm kurum' : `${scopeDepartmentCount} bölüm`;
    const bytes = await buildUsageWorkbook(metrics, label);
    await recordAdminAction(tx, {
      actor: scope.actor,
      action: 'DATA_EXPORT',
      targetType: 'USAGE_METRICS',
      targetId: filter.departmentId ?? filter.facultyId ?? 'ALL',
      metadata: {
        scopeDepartmentCount: scopeDepartmentCount ?? -1,
        rangeDays: Math.round((filter.to.getTime() - filter.from.getTime()) / 86_400_000),
      },
    });
    return { bytes, fileName: USAGE_EXPORT_FILE_NAME };
  }, TX);
}
