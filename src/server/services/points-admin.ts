import 'server-only';

import {
  decideSuspicionOutputSchema,
  decideSuspicionSchema,
  listPointEntriesSchema,
  listSuspicionFlagsSchema,
  pointRuleViewSchema,
  requestPointBackfillSchema,
  revokePointEntrySchema,
  updatePointRuleSchema,
  type DecideSuspicionInput,
  type DecideSuspicionOutput,
  type ListPointEntriesInput,
  type ListSuspicionFlagsInput,
  type PointEntryPage,
  type PointRuleView,
  type RequestPointBackfillInput,
  type RequestPointBackfillOutput,
  type RevokePointEntryInput,
  type RevokePointEntryOutput,
  type SuspicionFlagPage,
  type UpdatePointRuleInput,
} from '@/contracts/points';
import type { Prisma } from '@/generated/prisma/client';
import { codedConflict, codedNotFound } from '@/lib/errors';

import {
  idCursorWhere,
  loadSystemAdmin,
  nowOf,
  readAsAdmin,
  toPage,
  TX_OPTIONS,
  type AdminDeps,
  type Tx,
} from './admin-access';
import { recordAdminAction } from './audit';
import { listEntryViews } from './points';

/**
 * Puan motoru yönetimi (P1-16; yalnız SİSTEM yöneticisi). Yetki işlemin içinde yeniden yüklenir; her yazan eylem
 * `recordAdminAction` ile AYNI işlemde kaydedilir. İşlem kaydı metadata'sı yalnız sayılar ve sabit adlar taşır.
 * Geri alma (`REVOKED`) kalıcıdır: aynı kayıt tekrar canlandırılmaz; olay yeniden yazılamaz (benzersiz anahtar sürer).
 */

export type PointAdminDeps = AdminDeps & {
  /** `points.backfill` işini kuyruğa yazar; ulaşılamazsa fırlatır. */
  enqueueBackfill: () => Promise<void>;
};

const RULE_SELECT = {
  action: true,
  points: true,
  delayDays: true,
  isActive: true,
  updatedAt: true,
} satisfies Prisma.PointRuleSelect;

export async function listPointRules(deps: AdminDeps, adminId: string): Promise<PointRuleView[]> {
  return readAsAdmin(deps, adminId, 'SYSTEM_ONLY', async ({ tx }) => {
    const rows = await tx.pointRule.findMany({ orderBy: { action: 'asc' }, select: RULE_SELECT });
    return rows.map((row) => pointRuleViewSchema.parse(row));
  });
}

/** Kural değişikliği yalnız GELECEKTEKİ kayıtları etkiler (kayıt, o anki taban puanı saklar). */
export async function updatePointRule(
  deps: AdminDeps,
  adminId: string,
  input: UpdatePointRuleInput,
): Promise<PointRuleView> {
  const parsed = updatePointRuleSchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const admin = await loadSystemAdmin(tx, adminId, now);
    const before = await tx.pointRule.findUnique({
      where: { action: parsed.action },
      select: RULE_SELECT,
    });
    const data = {
      points: parsed.points,
      delayDays: parsed.delayDays,
      isActive: parsed.isActive,
      updatedById: adminId,
    };
    const row = await tx.pointRule.upsert({
      where: { action: parsed.action },
      create: { action: parsed.action, ...data },
      update: data,
      select: RULE_SELECT,
    });
    await recordAdminAction(tx, {
      actor: admin,
      action: 'POINT_RULE_CHANGE',
      targetType: 'POINT_RULE',
      targetId: parsed.action,
      reason: parsed.reason,
      metadata: {
        points: parsed.points,
        delayDays: parsed.delayDays,
        isActive: parsed.isActive,
        previousPoints: before?.points ?? null,
        previousDelayDays: before?.delayDays ?? null,
        previousIsActive: before?.isActive ?? null,
      },
    });
    return pointRuleViewSchema.parse(row);
  }, TX_OPTIONS);
}

export async function listPointEntries(
  deps: AdminDeps,
  adminId: string,
  input: ListPointEntriesInput,
): Promise<PointEntryPage> {
  const parsed = listPointEntriesSchema.parse(input);
  return readAsAdmin(deps, adminId, 'SYSTEM_ONLY', async ({ tx }) => {
    const user = await tx.user.findUnique({ where: { id: parsed.userId }, select: { id: true } });
    if (!user) throw codedNotFound('RESOURCE_NOT_FOUND');
    return listEntryViews(
      tx,
      { userId: parsed.userId, ...(parsed.status ? { status: parsed.status } : {}) },
      parsed.limit,
      parsed.cursor,
    );
  });
}

/** Kayıtları geri alır ve kaynağı bu kayıtlar olan etiketleri düşürür. Kilit çağıranda alınmıştır. */
async function revokeEntries(
  tx: Tx,
  entryIds: string[],
  reason: 'ADMIN_CANCEL' | 'FRAUD_CONFIRMED',
  adminId: string,
  now: Date,
): Promise<{ revokedCount: number; badgeRevoked: boolean }> {
  const { count } = await tx.pointEntry.updateMany({
    where: { id: { in: entryIds }, status: { not: 'REVOKED' } },
    data: { status: 'REVOKED', revokedAt: now, revokedById: adminId, revokedReason: reason },
  });
  // Etiket, kaynağı geri alınan kayıt olduğunda düşer (zaten düşmüşse dokunulmaz).
  const badges = await tx.userBadge.updateMany({
    where: { sourceEntryId: { in: entryIds }, revokedAt: null },
    data: { revokedAt: now },
  });
  return { revokedCount: count, badgeRevoked: badges.count > 0 };
}

/** Bekleyen kaydı iptal eder / kesinleşmiş kaydı geri alır; gerekçe zorunlu, işlem kaydı aynı işlemde. */
export async function revokePointEntry(
  deps: AdminDeps,
  adminId: string,
  input: RevokePointEntryInput,
): Promise<RevokePointEntryOutput> {
  const parsed = revokePointEntrySchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const admin = await loadSystemAdmin(tx, adminId, now);
    await tx.$queryRaw`SELECT "id" FROM "PointEntry" WHERE "id"=${parsed.entryId} FOR UPDATE`;
    const entry = await tx.pointEntry.findUnique({
      where: { id: parsed.entryId },
      select: { id: true, status: true, action: true },
    });
    if (!entry) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (entry.status === 'REVOKED') throw codedConflict('POINT_ALREADY_REVOKED');
    const { badgeRevoked } = await revokeEntries(tx, [entry.id], 'ADMIN_CANCEL', adminId, now);
    await recordAdminAction(tx, {
      actor: admin,
      action: 'POINTS_REVOKE',
      targetType: 'POINT_ENTRY',
      targetId: entry.id,
      reason: parsed.reason,
      metadata: { pointAction: entry.action, previousStatus: entry.status, badgeRevoked },
    });
    return { entryId: entry.id, badgeRevoked };
  }, TX_OPTIONS);
}

export async function listSuspicionFlags(
  deps: AdminDeps,
  adminId: string,
  input: ListSuspicionFlagsInput,
): Promise<SuspicionFlagPage> {
  const parsed = listSuspicionFlagsSchema.parse(input);
  return readAsAdmin(deps, adminId, 'SYSTEM_ONLY', async ({ tx }) => {
    const rows = await tx.suspicionFlag.findMany({
      where: {
        ...(parsed.status ? { status: parsed.status } : {}),
        ...idCursorWhere(parsed.cursor),
      },
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
      select: {
        id: true,
        userId: true,
        rule: true,
        status: true,
        windowStart: true,
        windowEnd: true,
        entryCount: true,
        points: true,
        sharePercent: true,
        syncedCount: true,
        createdAt: true,
        decidedAt: true,
        user: { select: { name: true } },
      },
    });
    const page = toPage(rows, parsed.limit);
    return {
      items: page.items.map((row) => ({
        id: row.id,
        userId: row.userId,
        displayName: row.user.name,
        rule: row.rule,
        status: row.status,
        details: {
          windowStart: row.windowStart,
          windowEnd: row.windowEnd,
          entryCount: row.entryCount,
          points: row.points,
          sharePercent: row.sharePercent,
          syncedCount: row.syncedCount,
        },
        createdAt: row.createdAt,
        decidedAt: row.decidedAt,
      })),
      nextCursor: page.nextCursor,
    };
  });
}

/**
 * Şüphe kararı. `CONFIRM`: işarete bağlı kayıtlar geri alınır (`FRAUD_CONFIRMED`) ve rozeti bu kayıtlardan gelen düşer;
 * `DISMISS`: puana dokunulmaz. İşaret bir kez karara bağlanır (ikinci karar `SUSPICION_ALREADY_DECIDED`).
 */
export async function decideSuspicion(
  deps: AdminDeps,
  adminId: string,
  input: DecideSuspicionInput,
): Promise<DecideSuspicionOutput> {
  const parsed = decideSuspicionSchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const admin = await loadSystemAdmin(tx, adminId, now);
    await tx.$queryRaw`SELECT "id" FROM "SuspicionFlag" WHERE "id"=${parsed.flagId} FOR UPDATE`;
    const flag = await tx.suspicionFlag.findUnique({
      where: { id: parsed.flagId },
      select: { id: true, status: true, rule: true, entryIds: true },
    });
    if (!flag) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (flag.status !== 'OPEN') throw codedConflict('SUSPICION_ALREADY_DECIDED');
    const confirm = parsed.decision === 'CONFIRM';
    const { revokedCount } = confirm
      ? await revokeEntries(tx, flag.entryIds, 'FRAUD_CONFIRMED', adminId, now)
      : { revokedCount: 0 };
    const status = confirm ? 'CONFIRMED' : 'DISMISSED';
    await tx.suspicionFlag.update({
      where: { id: flag.id },
      data: { status, decidedAt: now, decidedById: adminId },
    });
    await recordAdminAction(tx, {
      actor: admin,
      action: 'SUSPICION_DECIDE',
      targetType: 'SUSPICION_FLAG',
      targetId: flag.id,
      reason: parsed.reason,
      metadata: { rule: flag.rule, decision: parsed.decision, revokedCount },
    });
    return decideSuspicionOutputSchema.parse({ flagId: flag.id, status, revokedCount });
  }, TX_OPTIONS);
}

/**
 * Geriye dönük hesaplamayı kuyruğa alır (`points.backfill`; bir kez çalışması beklenir, tekrar çalışması zararsızdır).
 * İşlem kaydı kuyruğa yazmadan ÖNCE kesinleşir: kuyruk ulaşılamazsa istek kaydıyla birlikte hata döner ve yönetici yeniden dener.
 */
export async function requestPointBackfill(
  deps: PointAdminDeps,
  adminId: string,
  input: RequestPointBackfillInput,
): Promise<RequestPointBackfillOutput> {
  requestPointBackfillSchema.parse(input);
  const now = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    const admin = await loadSystemAdmin(tx, adminId, now);
    await recordAdminAction(tx, {
      actor: admin,
      action: 'POINTS_BACKFILL',
      targetType: 'POINT_RULE',
      targetId: 'backfill',
    });
  }, TX_OPTIONS);
  try {
    await deps.enqueueBackfill();
  } catch {
    throw codedConflict('POINT_BACKFILL_UNAVAILABLE');
  }
  return { queued: true };
}
