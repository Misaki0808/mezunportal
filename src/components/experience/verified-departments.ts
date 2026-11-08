import 'server-only';

import { getVerificationState } from '@/server/actions/auth';

import type { DepartmentOption } from './experience-form';

/** Doğrulanmış etkin üyelikteki bölümler (yazı yazılabilecek bölümler). Sunucu yine kontrol eder. */
export async function loadVerifiedDepartments() {
  const state = await getVerificationState().catch(() => null);
  if (!state) return { ok: false as const, errorCode: 'SERVER_UNEXPECTED' as const };
  if (!state.ok) return { ok: false as const, errorCode: state.errorCode };
  const seen = new Map<string, DepartmentOption>();
  for (const membership of state.data.memberships) {
    if (membership.verificationStatus === 'VERIFIED') {
      seen.set(membership.departmentId, {
        id: membership.departmentId,
        name: membership.departmentName,
      });
    }
  }
  return { ok: true as const, departments: [...seen.values()] };
}
