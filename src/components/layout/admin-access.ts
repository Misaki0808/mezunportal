import 'server-only';

import { cache } from 'react';
import { unstable_rethrow } from 'next/navigation';

import {
  requireAdmin,
  requireUserWithoutConsent,
  requirePageAdmin,
  requirePageUserWithoutConsent,
} from '@/server/permissions';
import type { AdminTargetInput } from '@/server/permissions';
import { isCodedError } from '@/lib/errors';

/** Yalnız rol uygunluğu. Ürün verisi eylemlerin rıza kapısından ayrıca geçer. */
async function checkAdminAccess(propagateUnexpected: boolean): Promise<boolean> {
  const actor = await (
    propagateUnexpected ? requirePageUserWithoutConsent() : requireUserWithoutConsent()
  ).catch((error: unknown) => {
    unstable_rethrow(error);
    if (propagateUnexpected && !isCodedError(error)) throw error;
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
      (await (propagateUnexpected ? requirePageAdmin(target) : requireAdmin(target)).then(
        () => true,
        // requireAdmin önce rol/kapsamı doğrular. Sonraki rıza reddi rol yokluğu değildir;
        // sayfanın veri eylemi CONSENT_REQUIRED döndürüp doğru onay çağrısını gösterir.
        (error: unknown) => {
          unstable_rethrow(error);
          if (propagateUnexpected && !isCodedError(error)) throw error;
          return isCodedError(error) && error.code === 'CONSENT_REQUIRED';
        },
      ))
    )
      return true;
  }
  return false;
}

/** Görünürlük için önceki fail-closed davranış. */
export const hasAdminAccess = cache(() => checkAdminAccess(false));

/** Sayfa kapısında beklenmedik arıza ayrı raporlanır. */
export const hasAdminAccessStrict = cache(() => checkAdminAccess(true));
