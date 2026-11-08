import 'server-only';
import { hasAdminAccess } from '@/components/layout/admin-access';
import { getAdminOverview } from '@/server/actions/admin';
import type { AdminOverview } from '@/contracts/admin';
import type { ErrorCode } from '@/lib/errors';

export async function adminAccess(
  capability: keyof AdminOverview['capabilities'],
): Promise<{ ok: true; overview: AdminOverview } | { ok: false; errorCode: ErrorCode }> {
  if (!(await hasAdminAccess())) return { ok: false, errorCode: 'AUTH_FORBIDDEN' };
  const result = await getAdminOverview().catch(() => null);
  if (!result) return { ok: false, errorCode: 'SERVER_UNEXPECTED' };
  if (!result.ok) return { ok: false, errorCode: result.errorCode };
  if (!result.data.capabilities[capability]) return { ok: false, errorCode: 'AUTH_FORBIDDEN' };
  return { ok: true, overview: result.data };
}
