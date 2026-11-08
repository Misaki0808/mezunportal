import 'server-only';

import type { Prisma, PrismaClient } from '@/generated/prisma/client';

import { loadActor, type Actor } from '../permissions/actor';
import { errorForDenyReason } from '../permissions/guards';
import { listManagedDepartmentIds, resolveDepartmentScope } from '../permissions/scope';
import { describeManagedScope, evaluateAccess } from '../rules/authorization';
import { requireConsent } from './privacy';

/**
 * Yönetim paneli servislerinin ortak yetki yardımcıları (P1-11). Yetki HER ZAMAN işlemin içinde güncel veriyle
 * yeniden yüklenir; bayat bir `Actor` yetki vermez. Yazan eylemler `SHARE` kilidi alır (hesap silme/askı ile
 * sıralanır), okuyanlar almaz.
 */
export type Tx = Prisma.TransactionClient;
export type AdminDeps = { db: PrismaClient; now?: () => Date };
export const nowOf = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();
export const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export type AdminLevelRequirement = 'ANY_ADMIN' | 'SYSTEM_ONLY';

/** Kilit altında güncel olgularla yönetici yükler; yetki yoksa kodlu hata fırlatır. */
export async function loadAdmin(
  tx: Tx,
  adminUserId: string,
  now: Date,
  level: AdminLevelRequirement,
  options: { lock: boolean } = { lock: true },
): Promise<Actor> {
  // SHARE hesap silme/askıyı bekletir, audit'in aktör FK okumasıyla uyumludur.
  if (options.lock) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${adminUserId} FOR SHARE`;
  const actor = await loadActor(tx, adminUserId, now);
  const decision = evaluateAccess(
    actor?.facts ?? null,
    level === 'SYSTEM_ONLY'
      ? { action: 'adminScope', target: { kind: 'SYSTEM' } }
      : { action: 'adminAny' },
  );
  if (!decision.allowed || !actor) {
    throw errorForDenyReason(decision.allowed ? 'UNAUTHENTICATED' : decision.reason);
  }
  await requireConsent(tx, actor.userId);
  return actor;
}

export const loadAnyAdmin = (tx: Tx, adminUserId: string, now: Date) =>
  loadAdmin(tx, adminUserId, now, 'ANY_ADMIN');
export const loadSystemAdmin = (tx: Tx, adminUserId: string, now: Date) =>
  loadAdmin(tx, adminUserId, now, 'SYSTEM_ONLY');

export const isSystem = (actor: Actor) => describeManagedScope(actor.facts.grants).system;

/** Bölüm bu yöneticinin kapsamında mı? (Sistem yöneticisi için her zaman; bölüm yoksa `false`.) */
export async function covers(tx: Tx, actor: Actor, departmentId: string): Promise<boolean> {
  const department = await resolveDepartmentScope(tx, departmentId);
  if (!department) return false;
  return evaluateAccess(actor.facts, {
    action: 'adminScope',
    target: { kind: 'DEPARTMENT', department },
  }).allowed;
}

/**
 * OKUMA işlemi: yönetici yetkisi işlemin içinde yeniden yüklenir, sonra `run` yöneticinin kapsamındaki bölüm
 * kimlikleriyle çağrılır. İstemci süzgeçleri bu kümeyle KESİŞİR (yetki vermez).
 */
export async function readAsAdmin<T>(
  deps: AdminDeps,
  adminUserId: string,
  level: AdminLevelRequirement,
  run: (context: {
    tx: Tx;
    actor: Actor;
    now: Date;
    departmentIds: string[];
    system: boolean;
  }) => Promise<T>,
): Promise<T> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await loadAdmin(tx, adminUserId, now, level, { lock: false });
    const departmentIds = await listManagedDepartmentIds(tx, actor.facts);
    return run({ tx, actor, now, departmentIds, system: isSystem(actor) });
  }, TX_OPTIONS);
}

/** İstemci bölüm süzgecini yönetici kapsamıyla keser: kapsam dışı kimlik boş küme verir (varlık sızmaz). */
export function intersectDepartments(scopeIds: readonly string[], requested?: string): string[] {
  return requested === undefined ? [...scopeIds] : scopeIds.filter((id) => id === requested);
}

/** Kimlik (uuid v7, zamana göre sıralı) imleçli sayfalama: yeniden eskiye. */
export const idCursorWhere = (cursor: string | undefined) => (cursor ? { id: { lt: cursor } } : {});
export function toPage<T extends { id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}
