import { describe, expect, it } from 'vitest';
import { academicYearBounds, awardFreezeAt, linkedinAwardUrl } from './yearAlumni';

describe('yılın mezunu kuralları', () => {
  it('akademik yılı İstanbul sınırlarıyla ayırır ve törenden 30 gün önce dondurur', () => {
    expect(academicYearBounds(2025)).toEqual({
      start: new Date('2025-08-31T21:00:00Z'),
      end: new Date('2026-08-31T21:00:00Z'),
    });
    expect(awardFreezeAt('2026-06-30')).toEqual(new Date('2026-05-30T21:00:00Z'));
  });
  it('LinkedIn parametrelerini kodlar ve alan enjeksiyonunu engeller', () => {
    const url = new URL(
      linkedinAwardUrl({
        name: 'Ödül & certUrl=https://evil.test',
        organization: 'İstanbul Üniversitesi',
        organizationId: '123&name=x',
        year: 2026,
        month: 6,
        verificationUrl: 'https://example.test/dogrula/abc',
      }),
    );
    expect(url.origin).toBe('https://www.linkedin.com');
    expect(url.searchParams.get('name')).toBe('Ödül & certUrl=https://evil.test');
    expect(url.searchParams.get('certUrl')).toBe('https://example.test/dogrula/abc');
    expect(url.searchParams.has('organizationId')).toBe(false);
    expect(() =>
      linkedinAwardUrl({
        name: 'x',
        organization: 'y',
        organizationId: null,
        year: 2026,
        month: 6,
        verificationUrl: 'javascript:alert(1)',
      }),
    ).toThrow();
  });
});
