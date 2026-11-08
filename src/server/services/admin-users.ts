import 'server-only';

import type {
  CorrectMembershipOutput,
  GrantAdminOutput,
  RevokeAdminOutput,
  SuspendUserOutput,
  UnsuspendUserOutput,
} from '@/contracts/admin-users';
import { SUSPENSION_MAX_DAYS } from '@/contracts/admin-users';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  codedConflict,
  codedForbidden,
  codedNotFound,
  codedValidation,
  type ErrorCode,
} from '@/lib/errors';

import { loadActor, type Actor } from '../permissions/actor';
import { errorForDenyReason } from '../permissions/guards';
import { resolveDepartmentScope } from '../permissions/scope';
import { findReasonProblem, type AdminActionName } from '../rules/adminAudit';
import { accountStatusOf, describeManagedScope, evaluateAccess } from '../rules/authorization';
import {
  planMembershipCorrection,
  wouldRemoveLastSystemGrant,
} from '../rules/membershipCorrection';
import { recordAdminAction } from './audit';

/**
 * Yönetim paneli — askıya alma, üyelik düzeltme, yönetici atama/kaldırma (P1-11 servis payı; D5, D6).
 * Kimlik yalnız `adminUserId`'dir (oturumdan, yetki korumasından geçmiş); her eylem yetkiyi işlemin İÇİNDE güncel
 * veriyle yeniden yükler (bayat bir Actor yetki vermez), hedef satırı kilitler ve değişikliği ile işlem kaydını
 * AYNI işlemde yazar: kayıt yazılamazsa eylem geri alınır. Sözleşme kuralları `contracts/admin-users.ts` başındadır.
 */

export type AdminUserDeps = { db: PrismaClient; now?: () => Date };
type Tx = Prisma.TransactionClient;

const nowOf = (deps: AdminUserDeps) => (deps.now ?? (() => new Date()))();
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/** Gerekçe, hiçbir yazma yapılmadan ÖNCE doğrulanır (kişisel veri içeren/eksik gerekçe veritabanına dokunmaz). */
function assertReason(action: AdminActionName, reason: string | undefined) {
  const problem = findReasonProblem(action, reason);
  if (problem === 'REQUIRED') throw codedValidation('AUDIT_REASON_REQUIRED');
  if (problem === 'INVALID') throw codedValidation('AUDIT_REASON_INVALID');
}

/** Kilit altında güncel olgularla: panele girebilen (kapsamı olan, doğrulanmış) yönetici. */
async function loadAnyAdmin(tx: Tx, adminUserId: string, now: Date): Promise<Actor> {
  const actor = await loadActor(tx, adminUserId, now);
  const decision = evaluateAccess(actor?.facts ?? null, { action: 'adminAny' });
  if (!decision.allowed || !actor) {
    throw errorForDenyReason(decision.allowed ? 'UNAUTHENTICATED' : decision.reason);
  }
  return actor;
}

async function loadSystemAdmin(tx: Tx, adminUserId: string, now: Date): Promise<Actor> {
  const actor = await loadActor(tx, adminUserId, now);
  const decision = evaluateAccess(actor?.facts ?? null, {
    action: 'adminScope',
    target: { kind: 'SYSTEM' },
  });
  if (!decision.allowed || !actor) {
    throw errorForDenyReason(decision.allowed ? 'UNAUTHENTICATED' : decision.reason);
  }
  return actor;
}

const isSystem = (actor: Actor) => describeManagedScope(actor.facts.grants).system;

/** Bölüm bu yöneticinin kapsamında mı? (Sistem yöneticisi için her zaman; bölüm yoksa `false`.) */
async function covers(tx: Tx, actor: Actor, departmentId: string): Promise<boolean> {
  const department = await resolveDepartmentScope(tx, departmentId);
  if (!department) return false;
  return evaluateAccess(actor.facts, {
    action: 'adminScope',
    target: { kind: 'DEPARTMENT', department },
  }).allowed;
}

/**
 * Hedef kullanıcıyı kilitler ve yönetici onu yönetebiliyor mu denetler:
 *  - kendi hesabı yasak;
 *  - kapsam dışı ya da var olmayan kullanıcı sistem dışı yöneticide AUTH_FORBIDDEN (varlık sızmaz);
 *  - hesap geneli işlem: hedefin BÜTÜN etkin üyelikleri kapsamda olmalı, hiç yoksa yalnız sistem yöneticisi;
 *  - etkin yönetici yetkisi olan hedefi yalnız sistem yöneticisi yönetir.
 */
async function lockAndAuthorizeTarget(tx: Tx, actor: Actor, targetUserId: string) {
  if (targetUserId === actor.userId) throw codedForbidden('ADMIN_SELF_ACTION');
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${targetUserId} FOR UPDATE`;
  const target = await tx.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      banned: true,
      banExpires: true,
      deletedAt: true,
      memberships: { where: { endedAt: null }, select: { departmentId: true } },
      adminGrants: { where: { revokedAt: null }, select: { id: true } },
    },
  });
  const system = isSystem(actor);
  if (!target || target.deletedAt !== null) {
    throw system ? codedNotFound('RESOURCE_NOT_FOUND') : codedForbidden('AUTH_FORBIDDEN');
  }
  if (!system) {
    if (target.memberships.length === 0) throw codedForbidden('AUTH_FORBIDDEN');
    for (const membership of target.memberships) {
      if (!(await covers(tx, actor, membership.departmentId))) {
        throw codedForbidden('AUTH_FORBIDDEN');
      }
    }
    if (target.adminGrants.length > 0) throw codedForbidden('ADMIN_TARGET_PRIVILEGED');
  }
  return target;
}

// ---------------------------------------------------------------------------------------------
// Askıya alma / kaldırma
// ---------------------------------------------------------------------------------------------

/**
 * Better Auth admin eklentisinin ban alanlarını yazar (`banned`, `banReason`, `banExpires`) ve kullanıcının
 * BÜTÜN oturumlarını aynı işlemde siler: açık çerez hemen geçersizdir, yeni oturum açılamaz (giriş kancası
 * `BANNED_USER` verir). Eklentinin HTTP ucu kapalı olduğundan (impersonation riski) yazma buradadır.
 */
export async function suspendUser(
  deps: AdminUserDeps,
  adminUserId: string,
  input: { userId: string; reason: string; expiresAt?: Date },
): Promise<SuspendUserOutput> {
  const now = nowOf(deps);
  assertReason('USER_SUSPEND', input.reason);
  if (input.expiresAt !== undefined) {
    const time = input.expiresAt.getTime();
    if (!(time > now.getTime()) || time > now.getTime() + SUSPENSION_MAX_DAYS * 86_400_000) {
      throw codedValidation('VALIDATION_INVALID');
    }
  }

  return deps.db.$transaction(async (tx) => {
    const actor = await loadAnyAdmin(tx, adminUserId, now);
    const target = await lockAndAuthorizeTarget(tx, actor, input.userId);
    if (accountStatusOf(target, now) === 'SUSPENDED') throw codedConflict('USER_ALREADY_SUSPENDED');

    const expiresAt = input.expiresAt ?? null;
    await tx.user.update({
      where: { id: target.id },
      data: { banned: true, banReason: input.reason.trim(), banExpires: expiresAt },
    });
    const revoked = await tx.session.deleteMany({ where: { userId: target.id } });

    await recordAdminAction(tx, {
      actor,
      action: 'USER_SUSPEND',
      targetType: 'USER',
      targetId: target.id,
      reason: input.reason,
      metadata: {
        userId: target.id,
        indefinite: expiresAt === null,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        sessionsRevoked: revoked.count,
      },
    });
    return {
      userId: target.id,
      status: 'SUSPENDED' as const,
      expiresAt,
      sessionsRevoked: revoked.count,
    };
  }, TX_OPTIONS);
}

export async function unsuspendUser(
  deps: AdminUserDeps,
  adminUserId: string,
  input: { userId: string; reason?: string },
): Promise<UnsuspendUserOutput> {
  const now = nowOf(deps);
  assertReason('USER_UNSUSPEND', input.reason);

  return deps.db.$transaction(async (tx) => {
    const actor = await loadAnyAdmin(tx, adminUserId, now);
    const target = await lockAndAuthorizeTarget(tx, actor, input.userId);
    if (accountStatusOf(target, now) !== 'SUSPENDED') throw codedConflict('USER_NOT_SUSPENDED');

    await tx.user.update({
      where: { id: target.id },
      data: { banned: false, banReason: null, banExpires: null },
    });
    await recordAdminAction(tx, {
      actor,
      action: 'USER_UNSUSPEND',
      targetType: 'USER',
      targetId: target.id,
      reason: input.reason,
      metadata: { userId: target.id },
    });
    return { userId: target.id, status: 'ACTIVE' as const };
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------------------------
// Üyelik (rol/bölüm) düzeltme
// ---------------------------------------------------------------------------------------------

const CORRECTION_PROBLEM_CODE: ErrorCode = 'MEMBERSHIP_CORRECTION_INVALID';

/**
 * Yanlış beyanı düzeltir (`ROLE_CORRECT`). Eski bölüm ve yeni bölüm yöneticinin kapsamında olmalıdır; yetkili
 * kullanıcının üyeliğini yalnız sistem yöneticisi düzeltir, kendi üyeliğin düzeltilemez. Bölüm/rol değişirse
 * eski satır kapanır ve yöneticice doğrulanmış yeni satır açılır (geçmiş korunur; içerik ve puan kullanıcıda kalır).
 */
export async function correctMembership(
  deps: AdminUserDeps,
  adminUserId: string,
  input: {
    membershipId: string;
    reason: string;
    changes: {
      departmentId?: string;
      role?: 'STUDENT' | 'ALUMNI' | 'ACADEMIC';
      entryYear?: number | null;
      graduationYear?: number | null;
    };
  },
): Promise<CorrectMembershipOutput> {
  const now = nowOf(deps);
  assertReason('ROLE_CORRECT', input.reason);

  return deps.db.$transaction(async (tx) => {
    const actor = await loadAnyAdmin(tx, adminUserId, now);
    const system = isSystem(actor);
    const forbidden = () =>
      system ? codedNotFound('RESOURCE_NOT_FOUND') : codedForbidden('AUTH_FORBIDDEN');

    await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id" = ${input.membershipId} FOR UPDATE`;
    const membership = await tx.membership.findUnique({
      where: { id: input.membershipId },
      select: {
        id: true,
        userId: true,
        departmentId: true,
        role: true,
        verificationStatus: true,
        endedAt: true,
        entryYear: true,
        graduationYear: true,
        classOffset: true,
      },
    });
    if (!membership) throw forbidden();
    if (membership.userId === actor.userId) throw codedForbidden('ADMIN_SELF_ACTION');

    const owner = await tx.user.findUnique({
      where: { id: membership.userId },
      select: {
        deletedAt: true,
        adminGrants: { where: { revokedAt: null }, select: { id: true } },
      },
    });
    if (!owner || owner.deletedAt !== null) throw forbidden();
    if (!(await covers(tx, actor, membership.departmentId))) throw forbidden();
    if (owner.adminGrants.length > 0 && !system) throw codedForbidden('ADMIN_TARGET_PRIVILEGED');

    const plan = planMembershipCorrection(membership, input.changes);
    if (plan.outcome === 'INVALID') {
      throw codedValidation(CORRECTION_PROBLEM_CODE, { reason: plan.problem });
    }
    if (input.changes.departmentId !== undefined) {
      const target = await resolveDepartmentScope(tx, input.changes.departmentId);
      if (!target) throw codedValidation(CORRECTION_PROBLEM_CODE, { reason: 'DEPARTMENT_MISSING' });
      if (!(await covers(tx, actor, input.changes.departmentId))) {
        throw codedForbidden('AUTH_FORBIDDEN');
      }
    }

    let resultId = membership.id;
    let previousId: string | null = null;
    if (plan.outcome === 'IN_PLACE') {
      await tx.membership.update({
        where: { id: membership.id },
        data: { entryYear: plan.next.entryYear, graduationYear: plan.next.graduationYear },
      });
    } else {
      // Aynı kullanıcının aynı bölüm+rolde zaten etkin üyeliği varsa çift açılmaz.
      const duplicate = await tx.membership.findFirst({
        where: {
          userId: membership.userId,
          departmentId: plan.next.departmentId,
          role: plan.next.role,
          endedAt: null,
          id: { not: membership.id },
        },
        select: { id: true },
      });
      if (duplicate) throw codedValidation(CORRECTION_PROBLEM_CODE, { reason: 'DUPLICATE' });

      await tx.membership.update({ where: { id: membership.id }, data: { endedAt: now } });
      const created = await tx.membership.create({
        data: {
          userId: membership.userId,
          departmentId: plan.next.departmentId,
          role: plan.next.role,
          entryYear: plan.next.entryYear,
          graduationYear: plan.next.graduationYear,
          classOffset: plan.next.classOffset,
          verificationStatus: 'VERIFIED',
          verificationMethod: 'ADMIN',
          verifiedAt: now,
          verifiedById: actor.userId,
        },
        select: { id: true },
      });
      resultId = created.id;
      previousId = membership.id;
    }

    await recordAdminAction(tx, {
      actor,
      action: 'ROLE_CORRECT',
      targetType: 'MEMBERSHIP',
      targetId: resultId,
      reason: input.reason,
      metadata: {
        userId: membership.userId,
        previousMembershipId: previousId,
        fromDepartmentId: membership.departmentId,
        toDepartmentId: plan.next.departmentId,
        fromRole: membership.role,
        toRole: plan.next.role,
        mode: plan.outcome,
      },
    });
    return { membershipId: resultId, previousMembershipId: previousId };
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------------------------
// Yönetici atama / kaldırma (yalnız sistem yöneticisi)
// ---------------------------------------------------------------------------------------------

/**
 * Yetki değiştirenler tek bir tavsiye kilidiyle SIRALANIR ve yetki kilitten SONRA yüklenir: iki sistem
 * yöneticisi aynı anda birbirini kaldırmaya çalışırsa ikincisi güncel durumda yetkisiz kalır (sistemde en az bir
 * yönetici kalır).
 */
async function lockAdminGrants(tx: Tx) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('admin-grants', 0))::text`;
}

export async function grantAdmin(
  deps: AdminUserDeps,
  adminUserId: string,
  input:
    | { scope: 'SYSTEM'; userId: string; reason?: string }
    | { scope: 'FACULTY'; userId: string; facultyId: string; reason?: string }
    | { scope: 'DEPARTMENT'; userId: string; departmentId: string; reason?: string },
): Promise<GrantAdminOutput> {
  const now = nowOf(deps);
  assertReason('ADMIN_GRANT', input.reason);

  return deps.db.$transaction(async (tx) => {
    await lockAdminGrants(tx);
    const actor = await loadSystemAdmin(tx, adminUserId, now);
    if (input.userId === actor.userId) throw codedForbidden('ADMIN_SELF_ACTION');

    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { deletedAt: true },
    });
    if (!user || user.deletedAt !== null) throw codedNotFound('RESOURCE_NOT_FOUND');

    const facultyId = input.scope === 'FACULTY' ? input.facultyId : null;
    const departmentId = input.scope === 'DEPARTMENT' ? input.departmentId : null;
    if (
      facultyId &&
      !(await tx.faculty.findUnique({ where: { id: facultyId }, select: { id: true } }))
    ) {
      throw codedNotFound('RESOURCE_NOT_FOUND');
    }
    if (departmentId && !(await resolveDepartmentScope(tx, departmentId))) {
      throw codedNotFound('RESOURCE_NOT_FOUND');
    }

    const existing = await tx.adminGrant.findFirst({
      where: { userId: input.userId, scope: input.scope, facultyId, departmentId, revokedAt: null },
      select: { id: true },
    });
    if (existing) throw codedConflict('ADMIN_GRANT_EXISTS');

    const grant = await tx.adminGrant.create({
      data: {
        userId: input.userId,
        scope: input.scope,
        facultyId,
        departmentId,
        grantedById: actor.userId,
      },
      select: { id: true },
    });
    await recordAdminAction(tx, {
      actor,
      action: 'ADMIN_GRANT',
      targetType: 'ADMIN_GRANT',
      targetId: grant.id,
      reason: input.reason,
      metadata: { userId: input.userId, scope: input.scope, facultyId, departmentId },
    });
    return { grantId: grant.id };
  }, TX_OPTIONS);
}

export async function revokeAdmin(
  deps: AdminUserDeps,
  adminUserId: string,
  input: { grantId: string; reason: string },
): Promise<RevokeAdminOutput> {
  const now = nowOf(deps);
  assertReason('ADMIN_REVOKE', input.reason);

  return deps.db.$transaction(async (tx) => {
    await lockAdminGrants(tx);
    const actor = await loadSystemAdmin(tx, adminUserId, now);

    const grant = await tx.adminGrant.findUnique({
      where: { id: input.grantId },
      select: {
        id: true,
        userId: true,
        scope: true,
        facultyId: true,
        departmentId: true,
        revokedAt: true,
      },
    });
    if (!grant) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (grant.userId === actor.userId) throw codedForbidden('ADMIN_SELF_ACTION');
    if (grant.revokedAt !== null) throw codedConflict('ADMIN_GRANT_NOT_ACTIVE');

    if (grant.scope === 'SYSTEM') {
      const holders = await tx.adminGrant.findMany({
        where: { scope: 'SYSTEM', revokedAt: null },
        select: { id: true, user: { select: { deletedAt: true } } },
      });
      const last = wouldRemoveLastSystemGrant(
        holders.map((holder) => ({
          grantId: holder.id,
          userDeleted: holder.user.deletedAt !== null,
        })),
        grant.id,
      );
      if (last) throw codedConflict('ADMIN_LAST_SYSTEM_GRANT');
    }

    await tx.adminGrant.update({
      where: { id: grant.id },
      data: { revokedAt: now, revokedById: actor.userId },
    });
    await recordAdminAction(tx, {
      actor,
      action: 'ADMIN_REVOKE',
      targetType: 'ADMIN_GRANT',
      targetId: grant.id,
      reason: input.reason,
      metadata: {
        userId: grant.userId,
        scope: grant.scope,
        facultyId: grant.facultyId,
        departmentId: grant.departmentId,
      },
    });
    return { grantId: grant.id, revokedAt: now };
  }, TX_OPTIONS);
}
