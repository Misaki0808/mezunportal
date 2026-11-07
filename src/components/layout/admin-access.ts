import 'server-only';

import { cache } from 'react';

import { requireAdmin, requireUser } from '@/server/permissions';
import type { AdminTargetInput } from '@/server/permissions';

/** Görünürlük sunucuda aynı yetki korumasından türetilir; hatada bağlantı gizlenir. */
export const hasAdminAccess = cache(async (): Promise<boolean> => {
  const actor = await requireUser().catch(() => null);
  if (!actor) return false;
  for (const grant of actor.facts.grants) {
    let target: AdminTargetInput | undefined;
    if (grant.scope === 'SYSTEM') target = { kind: 'SYSTEM' };
    if (grant.scope === 'FACULTY' && grant.facultyId)
      target = { kind: 'FACULTY', facultyId: grant.facultyId };
    if (grant.scope === 'DEPARTMENT' && grant.departmentId)
      target = { kind: 'DEPARTMENT', departmentId: grant.departmentId };
    if (
      target &&
      (await requireAdmin(target).then(
        () => true,
        () => false,
      ))
    )
      return true;
  }
  return false;
});
