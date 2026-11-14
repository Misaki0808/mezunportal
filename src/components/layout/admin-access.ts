import 'server-only';

import { cache } from 'react';
import { unstable_rethrow } from 'next/navigation';

import { requireAdmin, requireUserWithoutConsent } from '@/server/permissions';
import type { AdminTargetInput } from '@/server/permissions';
import { isCodedError } from '@/lib/errors';

/** Yalnız rol uygunluğu. Ürün verisi eylemlerin rıza kapısından ayrıca geçer. */
export const hasAdminAccess = cache(async (): Promise<boolean> => {
  const actor = await requireUserWithoutConsent().catch((error: unknown) => {
    unstable_rethrow(error);
    return null;
  });
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
        // requireAdmin önce rol/kapsamı doğrular. Sonraki rıza reddi rol yokluğu değildir;
        // sayfanın veri eylemi CONSENT_REQUIRED döndürüp doğru onay çağrısını gösterir.
        (error: unknown) => {
          unstable_rethrow(error);
          return isCodedError(error) && error.code === 'CONSENT_REQUIRED';
        },
      ))
    )
      return true;
  }
  return false;
});
