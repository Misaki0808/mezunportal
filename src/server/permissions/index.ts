import 'server-only';

import { getDb } from '../db';
import { createPermissions } from './guards';
import { getSessionUserId } from './session';
import { requireConsent } from '../services/privacy';
import type { Actor } from './actor';
import type { AdminTargetInput, MemberFilter } from './guards';

export type { Actor } from './actor';
export { loadActor } from './actor';
export { createPermissions, errorForDenyReason } from './guards';
export type { AdminTargetInput, MemberFilter, Permissions } from './guards';
export { listManagedDepartmentIds, resolveDepartmentScope } from './scope';

// Varsayılan bağlantı: gerçek veritabanı + oturum. İstemci tembeldir (import anında env okunmaz).
const permissions = createPermissions({
  db: getDb,
  getSessionUserId,
  now: () => new Date(),
});

// Yalnız kimlik/kayıt ve kişinin kendi KVKK işlemleri bu korumayı açıkça kullanır.
export const requireUserWithoutConsent = permissions.requireUser;

async function withConsent(actor: Actor): Promise<Actor> {
  await requireConsent(getDb(), actor.userId);
  return actor;
}

// Rol/yetki denetimi önce, güncel zorunlu onay denetimi hemen sonra yapılır.
export const requireUser = async () => withConsent(await permissions.requireUser());
export const requireVerifiedMember = async (filter?: MemberFilter) =>
  withConsent(await permissions.requireVerifiedMember(filter));
export const requireMentor = async () => withConsent(await permissions.requireMentor());
export const requireAdmin = async (target: AdminTargetInput) =>
  withConsent(await permissions.requireAdmin(target));
export const requireAnyAdmin = async () => withConsent(await permissions.requireAnyAdmin());
export const requireModerator = async (departmentId: string) =>
  withConsent(await permissions.requireModerator(departmentId));
export const { canModerate, managedDepartmentIds } = permissions;
