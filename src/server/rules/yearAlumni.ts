/** Akademik yıl 1 Eylül 00.00 İstanbul'da başlar; üst sınır dışlayıcıdır. */
export function academicYearBounds(year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new RangeError('invalid year');
  return {
    start: new Date(Date.UTC(year, 7, 31, 21)),
    end: new Date(Date.UTC(year + 1, 7, 31, 21)),
  };
}

/** Takvim tarihi İstanbul 00.00; dondurma 30 gün önce. */
export function awardFreezeAt(ceremonyDate: string) {
  const ceremony = new Date(`${ceremonyDate}T00:00:00+03:00`);
  if (!Number.isFinite(ceremony.getTime())) throw new RangeError('invalid ceremony date');
  return new Date(ceremony.getTime() - 30 * 24 * 60 * 60 * 1000);
}

/** Yalnız sabit LinkedIn adresi ve izin verilen parametreler kullanılır. */
export function linkedinAwardUrl(input: {
  name: string;
  organization: string;
  organizationId: string | null;
  year: number;
  month: number;
  verificationUrl: string;
}) {
  const verification = new URL(input.verificationUrl);
  if (
    !['https:', 'http:'].includes(verification.protocol) ||
    verification.username ||
    verification.password
  )
    throw new RangeError('invalid verification url');
  const url = new URL('https://www.linkedin.com/profile/add');
  url.searchParams.set('startTask', 'CERTIFICATION_NAME');
  url.searchParams.set('name', input.name);
  url.searchParams.set('organizationName', input.organization);
  if (input.organizationId && /^\d+$/.test(input.organizationId))
    url.searchParams.set('organizationId', input.organizationId);
  url.searchParams.set('issueYear', String(input.year));
  if (Number.isInteger(input.month) && input.month >= 1 && input.month <= 12)
    url.searchParams.set('issueMonth', String(input.month));
  url.searchParams.set('certUrl', verification.toString());
  return url.toString();
}
