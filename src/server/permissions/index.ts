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

// Sayfa kapısında oturum altyapı hatası sessiz yetki reddine dönüşmesin.
// Diğer çağıranların önceki fail-closed oturum davranışı değişmez.
const pagePermissions = createPermissions({
  db: getDb,
  getSessionUserId: () => getSessionUserId({ propagateUnexpected: true }),
  now: () => new Date(),
});
export const requirePageUserWithoutConsent = pagePermissions.requireUser;

// Yalnız kimlik/kayıt ve kişinin kendi KVKK işlemleri bu korumayı açıkça kullanır.
export const requireUserWithoutConsent = permissions.requireUser;

async function withConsent(actor: Actor): Promise<Actor> {
  await requireConsent(getDb(), actor.userId);
  return actor;
}

// Sayfa kapıları aynı yetki ve rıza kurallarını, yalnız hata aktarımı farklı olarak kullanır.
export const requirePageVerifiedMember = async (filter?: MemberFilter) =>
  withConsent(await pagePermissions.requireVerifiedMember(filter));
export const requirePageAnyAdmin = async () => withConsent(await pagePermissions.requireAnyAdmin());
export const requirePageAdmin = async (target: AdminTargetInput) =>
  withConsent(await pagePermissions.requireAdmin(target));

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
