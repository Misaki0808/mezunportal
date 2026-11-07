import 'server-only';

import { codedForbidden, codedUnauthenticated, type CodedError } from '@/lib/errors';

import {
  evaluateAccess,
  type AccessRequest,
  type AdminTarget,
  type DenyReason,
  type MembershipRoleName,
} from '../rules/authorization';
import { loadActor, type Actor, type ActorReader } from './actor';
import { listManagedDepartmentIds, resolveDepartmentScope, type ScopeReader } from './scope';

/** Reddedilme nedenini kullanıcıya dönen kararlı hata koduna çevirir. */
export function errorForDenyReason(reason: DenyReason): CodedError {
  switch (reason) {
    case 'UNAUTHENTICATED':
      return codedUnauthenticated('AUTH_UNAUTHENTICATED');
    case 'SUSPENDED':
      return codedForbidden('AUTH_ACCOUNT_SUSPENDED');
    case 'NOT_VERIFIED':
      return codedForbidden('AUTH_NOT_VERIFIED');
    case 'FORBIDDEN':
      return codedForbidden('AUTH_FORBIDDEN');
  }
}

export type PermissionDeps = {
  db: () => ActorReader & ScopeReader;
  getSessionUserId: () => Promise<string | null>;
  now: () => Date;
};

/** İstemciden gelen DEĞİL, çağıran kodun verdiği hedef; bölüm kapsamı sunucuda çözülür. */
export type AdminTargetInput =
  | { kind: 'SYSTEM' }
  | { kind: 'FACULTY'; facultyId: string }
  | { kind: 'DEPARTMENT'; departmentId: string };

export type MemberFilter = {
  /** Bu bölümde doğrulanmış etkin üyelik şartı. */
  departmentId?: string;
  /** Bu rollerden birinde doğrulanmış etkin üyelik şartı. */
  roles?: readonly MembershipRoleName[];
};

/**
 * Yetki korumaları. Her sunucu eylemi ve rota işe ÖNCE bunlardan birini çağırır; kimlik oturumdan gelir,
 * karar `rules/authorization` içindeki saf kurallardandır. Bağımlılıklar enjekte edilir (testte gerçek
 * veritabanı + sahte oturum); üretimde `permissions/index.ts` varsayılanları bağlar.
 */
export function createPermissions(deps: PermissionDeps) {
  async function currentActor(): Promise<Actor | null> {
    const userId = await deps.getSessionUserId();
    if (!userId) return null;
    return loadActor(deps.db(), userId, deps.now());
  }

  function enforce(actor: Actor | null, request: AccessRequest): Actor {
    const decision = evaluateAccess(actor?.facts ?? null, request);
    if (!decision.allowed) throw errorForDenyReason(decision.reason);
    // `allowed` iken actor boş olamaz (null için karar UNAUTHENTICATED'dır).
    if (!actor) throw errorForDenyReason('UNAUTHENTICATED');
    return actor;
  }

  /** Oturum açmış, silinmemiş, askıda olmayan kullanıcı. (Doğrulanmış üye olması gerekmez.) */
  async function requireUser(): Promise<Actor> {
    return enforce(await currentActor(), { action: 'selfProfile' });
  }

  /** Doğrulanmış etkin üyeliği olan kullanıcı; isteğe bağlı bölüm/rol şartıyla. */
  async function requireVerifiedMember(filter: MemberFilter = {}): Promise<Actor> {
    const actor = enforce(await currentActor(), { action: 'directoryUse' });
    const matches = actor.facts.memberships.some(
      (membership) =>
        membership.verificationStatus === 'VERIFIED' &&
        membership.endedAt === null &&
        (filter.departmentId === undefined || membership.departmentId === filter.departmentId) &&
        (filter.roles === undefined || filter.roles.includes(membership.role)),
    );
    if (!matches) throw errorForDenyReason('FORBIDDEN');
    return actor;
  }

  /** Etkin mentor profili olan doğrulanmış üye. */
  async function requireMentor(): Promise<Actor> {
    return enforce(await currentActor(), { action: 'mentorAct' });
  }

  async function resolveTarget(input: AdminTargetInput): Promise<AdminTarget | null> {
    switch (input.kind) {
      case 'SYSTEM':
        return { kind: 'SYSTEM' };
      case 'FACULTY':
        return { kind: 'FACULTY', facultyId: input.facultyId };
      case 'DEPARTMENT': {
        const department = await resolveDepartmentScope(deps.db(), input.departmentId);
        return department ? { kind: 'DEPARTMENT', department } : null;
      }
    }
  }

  /**
   * Hedef kapsamı kapsayan yetkisi olan, doğrulanmış yönetici. Var olmayan bölüm, yetkisiz kullanıcının
   * karşılaştığı yanıtın aynısını (`AUTH_FORBIDDEN`) verir.
   */
  async function requireAdmin(input: AdminTargetInput): Promise<Actor> {
    const actor = await currentActor();
    // Oturumsuz/silinmiş/askıda önce elenir; kapsam çözümlemesi yetkisiz kullanıcıya hiçbir şey sızdırmaz.
    enforce(actor, { action: 'selfProfile' });
    const target = await resolveTarget(input);
    if (!target) throw errorForDenyReason('FORBIDDEN');
    return enforce(actor, { action: 'adminScope', target });
  }

  /** Bölümdeki içeriği/şikâyeti/doğrulamayı yönetebilir mi? (İçeriğin yazıldığı andaki bölüm verilir.) */
  async function requireModerator(departmentId: string): Promise<Actor> {
    return requireAdmin({ kind: 'DEPARTMENT', departmentId });
  }

  async function canModerate(actor: Actor, departmentId: string): Promise<boolean> {
    const department = await resolveDepartmentScope(deps.db(), departmentId);
    if (!department) return false;
    return evaluateAccess(actor.facts, {
      action: 'adminScope',
      target: { kind: 'DEPARTMENT', department },
    }).allowed;
  }

  /** Kuyruk ve liste süzgeci için yöneticinin kapsamındaki bölüm kimlikleri. */
  async function managedDepartmentIds(actor: Actor): Promise<string[]> {
    return listManagedDepartmentIds(deps.db(), actor.facts);
  }

  return {
    requireUser,
    requireVerifiedMember,
    requireMentor,
    requireAdmin,
    requireModerator,
    canModerate,
    managedDepartmentIds,
  };
}

export type Permissions = ReturnType<typeof createPermissions>;
