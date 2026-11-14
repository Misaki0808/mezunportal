import 'server-only';
import { hasAdminAccessStrict } from '@/components/layout/admin-access';
import { guardPage } from '@/server/permissions/page-guard';
import { getAdminOverview } from '@/server/actions/admin';
import type { AdminOverview } from '@/contracts/admin';
import type { ErrorCode } from '@/lib/errors';

export async function adminAccess(
  capability: keyof AdminOverview['capabilities'],
): Promise<{ ok: true; overview: AdminOverview } | { ok: false; errorCode: ErrorCode }> {
  const access = await guardPage('admin.access', hasAdminAccessStrict);
  if (!access.ok) return access;
  if (!access.value) return { ok: false, errorCode: 'AUTH_FORBIDDEN' };
  const guarded = await guardPage('admin.overview', getAdminOverview);
  if (!guarded.ok) return guarded;
  const result = guarded.value;
  if (!result.ok) return { ok: false, errorCode: result.errorCode };
  if (!result.data.capabilities[capability]) return { ok: false, errorCode: 'AUTH_FORBIDDEN' };
  return { ok: true, overview: result.data };
}
