import { expect, it } from 'vitest';
import { addDays, daysRemaining, istanbulDay, mayPost, parseJobFilters } from './model';
it('İstanbul gün sınırı ve 60 günlük son tarih', () => {
  const now = new Date('2026-11-08T22:30:00Z');
  expect(istanbulDay(now)).toBe('2026-11-09');
  expect(daysRemaining('2026-11-10', now)).toBe(1);
  expect(addDays(istanbulDay(now), 60)).toBe('2027-01-08');
});
it('URL süzgeçleri doğrulanır; hatalı alan sağlam alanı bozmaz', () => {
  expect(parseJobFilters(new URLSearchParams('q=staj&remote=true&withinDays=7&page=-1'))).toEqual({
    q: 'staj',
    remote: true,
    withinDays: 7,
  });
});
it('yalnız etkin doğrulanmış mezun ve akademisyen ilan verebilir', () => {
  expect(mayPost([{ role: 'STUDENT', verificationStatus: 'VERIFIED', endedAt: null }])).toBe(false);
  expect(mayPost([{ role: 'ALUMNI', verificationStatus: 'VERIFIED', endedAt: null }])).toBe(true);
  expect(mayPost([{ role: 'ACADEMIC', verificationStatus: 'VERIFIED', endedAt: null }])).toBe(true);
  expect(mayPost([{ role: 'ACADEMIC', verificationStatus: 'PENDING', endedAt: null }])).toBe(false);
  expect(mayPost([{ role: 'ALUMNI', verificationStatus: 'VERIFIED', endedAt: new Date() }])).toBe(
    false,
  );
});
it('serbest ve sözlük kurum seçimi aynı URL ile doğru alana çevrilir', () => {
  const options = [
    { key: 'abc', companyId: 'abc', name: 'Kurum' },
    { key: 'Bağımsız Kurum', companyId: null, name: 'Bağımsız Kurum' },
  ];
  expect(
    parseJobFilters(new URLSearchParams('organization=abc&location=İstanbul'), options),
  ).toMatchObject({ companyId: 'abc', location: 'İstanbul' });
  expect(
    parseJobFilters(new URLSearchParams('organization=Bağımsız+Kurum'), options),
  ).toMatchObject({ organizationName: 'Bağımsız Kurum' });
});
