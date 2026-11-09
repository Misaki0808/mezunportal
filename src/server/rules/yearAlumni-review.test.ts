import { expect, it } from 'vitest';
import { linkedinAwardUrl, academicYearBounds, awardFreezeAt } from './yearAlumni';
const strings = [
  'Ödül &certUrl=https://evil.invalid',
  '\" onmouseover=\"alert(1)',
  '<script>alert(1)</script>',
  'javascript:alert(1)',
  'a%26organizationId%3D123',
  'ad\r\nLocation: https://evil.invalid',
  'İstanbul Üniversitesi / + ? #',
];
it.each(strings)('LinkedIn parametre değeri başka alan veya adres olamaz: %s', (value) => {
  const target = 'https://portal.example.invalid/dogrula/opaque?x=' + encodeURIComponent(value);
  const url = new URL(
    linkedinAwardUrl({
      name: value,
      organization: value,
      organizationId: '12&certUrl=x',
      year: 2026,
      month: 6,
      verificationUrl: target,
    }),
  );
  expect(url.origin + url.pathname).toBe('https://www.linkedin.com/profile/add');
  expect([...url.searchParams.keys()].sort()).toEqual(
    ['certUrl', 'issueMonth', 'issueYear', 'name', 'organizationName', 'startTask'].sort(),
  );
  expect(url.searchParams.get('name')).toBe(value);
  expect(url.searchParams.get('organizationName')).toBe(value);
  expect(url.searchParams.get('certUrl')).toBe(target);
});
it.each([
  'javascript:alert(1)',
  'data:text/html,x',
  'https://user:secret@portal.invalid/dogrula/x',
  'file:///etc/passwd',
  '//evil.invalid',
])('tehlikeli doğrulama adresi reddedilir: %s', (verificationUrl) => {
  expect(() =>
    linkedinAwardUrl({
      name: 'Ödül',
      organization: 'Kurum',
      organizationId: null,
      year: 2026,
      month: 1,
      verificationUrl,
    }),
  ).toThrow();
});
it('akademik yıl İstanbul 1 Eylül ve tören 30 gün hesabı artık yılda da kararlı', () => {
  for (const year of [2024, 2025, 2026]) {
    const x = academicYearBounds(year);
    expect(x.start.toISOString()).toBe(`${year}-08-31T21:00:00.000Z`);
    expect(x.end.toISOString()).toBe(`${year + 1}-08-31T21:00:00.000Z`);
  }
  expect(awardFreezeAt('2024-03-30')).toEqual(new Date('2024-02-28T21:00:00Z'));
});
