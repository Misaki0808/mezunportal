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
it('adım denetimi sözleşmenin uzunluk, bağlantı ve koşullu alan kurallarını kullanır', async () => {
  const { postingStepErrors } = await import('./model');
  const content = {
    kind: 'INTERNSHIP',
    title: 'ab',
    organizationName: 'K',
    companyId: null,
    location: null,
    isRemote: false,
    description: '',
    deadlineOn: '',
    applyMethod: 'URL',
    applyUrl: '',
    targetDepartmentIds: [],
    tagIds: [],
    targetGrades: [],
  };
  expect(postingStepErrors(content, 'dep', 0, '2026-11-13')).toEqual(['title', 'organizationName']);
  expect(postingStepErrors(content, 'dep', 1, '2026-11-13')).toEqual([
    'description',
    'location',
    'deadlineOn',
    'targetDepartmentIds',
    'applyUrl',
  ]);
  const valid = {
    ...content,
    title: 'Staj',
    organizationName: 'Kurum',
    isRemote: true,
    description: 'Otuz karakterden uzun bir iş tanımı örneği.',
    deadlineOn: '2026-11-20',
    applyMethod: 'CONTACT_REQUEST',
    applyUrl: null,
    targetDepartmentIds: ['dep'],
  };
  expect(postingStepErrors(valid, 'dep', 0, '2026-11-13')).toEqual([]);
  expect(postingStepErrors(valid, 'dep', 1, '2026-11-13')).toEqual([]);
  expect(
    postingStepErrors({ ...valid, deadlineOn: '2027-02-20' }, 'dep', 1, '2026-11-13'),
  ).toContain('deadlineOn');
});

it('sözleşmedeki görünür alanların her biri tam bir adımda listelidir', async () => {
  const { jobPostingContentSchema } = await import('@/contracts/job-postings');
  const { postingStepFields, postingStepErrors } = await import('./model');
  const hiddenContentFields = ['companyId'];
  const visibleFields = Object.keys(jobPostingContentSchema.shape).filter(
    (key) => !hiddenContentFields.includes(key),
  );
  const mappedContentFields = postingStepFields.flat().filter((key) => key !== 'departmentId');
  expect([...mappedContentFields].sort()).toEqual(visibleFields.sort());
  expect(new Set(postingStepFields.flat()).size).toBe(postingStepFields.flat().length);
  expect(postingStepErrors({}, '', 0, '2026-11-13')).toContain('departmentId');
  expect(postingStepErrors({}, 'dep', 0, '2026-11-13')).not.toContain('departmentId');
});
