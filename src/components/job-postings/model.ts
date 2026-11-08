import { searchJobPostingsSchema, type SearchJobPostingsInput } from '@/contracts/job-postings';

import { JOB_POSTING_AUTHOR_ROLES } from '@/contracts/job-postings';
import { istanbulDay as dayInIstanbul, daysLeft } from '@/server/rules/jobPosting';
export { addDays } from '@/server/rules/jobPosting';

/** Varsayılan an ile sunucunun da kullandığı İstanbul takvimi. */
export function istanbulDay(now = new Date()): string {
  return dayInIstanbul(now);
}
export function daysRemaining(deadline: string, now = new Date()): number {
  return daysLeft(deadline, istanbulDay(now));
}
export function parseJobFilters(
  params: URLSearchParams,
  organizations: readonly { key: string; companyId: string | null; name: string }[] = [],
): SearchJobPostingsInput {
  const selected = organizations.find((item) => item.key === params.get('organization'));
  const candidate = {
    ...(params.get('q') ? { q: params.get('q') } : {}),
    ...(params.get('departmentId') ? { departmentId: params.get('departmentId') } : {}),
    ...(selected
      ? selected.companyId
        ? { companyId: selected.companyId }
        : { organizationName: selected.name }
      : params.get('companyId')
        ? { companyId: params.get('companyId') }
        : params.get('organizationName')
          ? { organizationName: params.get('organizationName') }
          : {}),
    ...(params.get('location') ? { location: params.get('location') } : {}),
    ...(params.get('kind') ? { kind: params.get('kind') } : {}),
    ...(params.get('remote') === 'true' ? { remote: true } : {}),
    ...(params.get('withinDays') ? { withinDays: Number(params.get('withinDays')) } : {}),
    ...(params.get('page') ? { page: Number(params.get('page')) } : {}),
  };
  const valid = searchJobPostingsSchema.safeParse(candidate);
  if (valid.success) return valid.data;
  // Bozuk paylaşılan URL tek bir alan yüzünden sayfayı kırmaz.
  const result: SearchJobPostingsInput = {};
  for (const [key, value] of Object.entries(candidate)) {
    const parsed = searchJobPostingsSchema.safeParse({ [key]: value });
    if (parsed.success) Object.assign(result, { [key]: value });
  }
  return result;
}
export function mayPost(
  roles: readonly { role: string; verificationStatus: string; endedAt: Date | null }[],
): boolean {
  return roles.some(
    (role) =>
      JOB_POSTING_AUTHOR_ROLES.some((allowed) => allowed === role.role) &&
      role.verificationStatus === 'VERIFIED' &&
      role.endedAt === null,
  );
}
