import 'server-only';

import { getDb } from '../db';
import { createPermissions } from './guards';
import { getSessionUserId } from './session';

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

export const {
  requireUser,
  requireVerifiedMember,
  requireMentor,
  requireAdmin,
  requireModerator,
  canModerate,
  managedDepartmentIds,
} = permissions;
