import { describe, expect, it } from 'vitest';
import { JOB_MATCH_THRESHOLDS, matchJobPosting, publicReach } from './jobMatch';
const now = new Date('2026-10-01T09:00:00Z');
const posting = { targetDepartmentIds: ['d1'], tagIds: ['sql', 'python'], targetGrades: [2, 4] };
const student = {
  departmentId: 'd1',
  entryYear: 2025,
  classOffset: 0,
  tagIds: ['sql', 'sql', 'excel'],
};
const noMatch = { matches: false, dashboardEligible: false, sharedTagIds: [] };
describe('ilan eşleştirme', () => {
  it('ortak etiketleri tekilleştirir', () => {
    expect(JOB_MATCH_THRESHOLDS.minTags).toBe(1);
    expect(matchJobPosting(posting, student, now)).toEqual({
      matches: true,
      dashboardEligible: true,
      sharedTagIds: ['sql'],
    });
  });
  it.each([
    ['başka bölüm', { ...student, departmentId: 'd2' }],
    ['ortak etiket yok', { ...student, tagIds: ['excel'] }],
    ['hedef dışı sınıf', { ...student, entryYear: 2026 }],
    ['bilinmeyen sınıf', { ...student, entryYear: null }],
    ['hazırlık', { ...student, entryYear: 2026, classOffset: -1 }],
  ])('%s eşleşmez', (_label, input) =>
    expect(matchJobPosting(posting, input, now)).toEqual(noMatch),
  );
  it('boş sınıf seçimi bilinmeyen sınıfı da kapsar', () => {
    expect(
      matchJobPosting({ ...posting, targetGrades: [] }, { ...student, entryYear: null }, now)
        .matches,
    ).toBe(true);
  });
  it('etiketsiz ilan yalnız panoda görünür', () => {
    expect(matchJobPosting({ ...posting, tagIds: [] }, student, now)).toEqual({
      matches: false,
      dashboardEligible: true,
      sharedTagIds: [],
    });
    expect(
      matchJobPosting({ ...posting, tagIds: [] }, { ...student, departmentId: 'd2' }, now),
    ).toEqual(noMatch);
  });
  it('akademik yılın İstanbul sınırında sınıf güncellenir', () => {
    expect(matchJobPosting(posting, student, new Date('2026-08-31T20:59:59Z')).matches).toBe(false);
    expect(matchJobPosting(posting, student, new Date('2026-08-31T21:00:00Z')).matches).toBe(true);
  });
  it('üçten küçük erişim tam sayı taşımaz', () => {
    expect(publicReach(2)).toEqual({ belowThreshold: true, count: null });
    expect(publicReach(3)).toEqual({ belowThreshold: false, count: 3 });
  });
});
