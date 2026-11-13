import {
  jobPostingContentSchema,
  saveJobPostingDraftSchema,
  searchJobPostingsSchema,
  type SearchJobPostingsInput,
} from '@/contracts/job-postings';

import { JOB_POSTING_AUTHOR_ROLES } from '@/contracts/job-postings';
import { deadlineProblem, istanbulDay as dayInIstanbul, daysLeft } from '@/server/rules/jobPosting';
export { addDays } from '@/server/rules/jobPosting';

/** Ekrandaki sıralama: ilk hataya odaklanmak ve sunucudan gelen yolu aynı adıma taşımak için. */
export const postingStepFields = [
  ['kind', 'title', 'organizationName', 'departmentId'],
  ['description', 'location', 'deadlineOn', 'targetDepartmentIds', 'applyUrl'],
] as const;

export function postingFieldStep(field: string): 0 | 1 | undefined {
  if ((postingStepFields[0] as readonly string[]).includes(field)) return 0;
  if ((postingStepFields[1] as readonly string[]).includes(field)) return 1;
  return undefined;
}

/** Kurallar tamamlanmış ilan ve taslak sözleşmesinden; başka adımın hataları geçişi engellemez. */
export function postingStepErrors(
  content: Record<string, unknown>,
  departmentId: string,
  step: 0 | 1,
  today: string,
): string[] {
  const fields = new Set<string>();
  const parsed = jobPostingContentSchema.safeParse(content);
  if (!parsed.success) for (const issue of parsed.error.issues) fields.add(String(issue.path[0]));
  if (!saveJobPostingDraftSchema.shape.departmentId.safeParse(departmentId).success)
    fields.add('departmentId');
  if (
    typeof content.deadlineOn === 'string' &&
    content.deadlineOn &&
    deadlineProblem(content.deadlineOn, today)
  )
    fields.add('deadlineOn');
  return postingStepFields[step].filter((field) => fields.has(field));
}

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
