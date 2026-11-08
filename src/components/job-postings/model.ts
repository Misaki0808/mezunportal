import { searchJobPostingsSchema, type SearchJobPostingsInput } from '@/contracts/job-postings';

/** İstanbul takvim günü; yerel tarayıcı saat diliminden bağımsızdır. */
export function istanbulDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function daysRemaining(deadline: string, now = new Date()): number {
  return Math.round(
    (Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${istanbulDay(now)}T00:00:00Z`)) / 86400000,
  );
}
export function parseJobFilters(params: URLSearchParams): SearchJobPostingsInput {
  const candidate = {
    ...(params.get('q') ? { q: params.get('q') } : {}),
    ...(params.get('departmentId') ? { departmentId: params.get('departmentId') } : {}),
    ...(params.get('companyId') ? { companyId: params.get('companyId') } : {}),
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
      (role.role === 'ALUMNI' || role.role === 'ACADEMIC') &&
      role.verificationStatus === 'VERIFIED' &&
      role.endedAt === null,
  );
}
