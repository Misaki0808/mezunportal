import { describe, expect, it } from 'vitest';
import { JOB_MATCH_THRESHOLDS, matchJobPosting, publicReach } from './jobMatch';
const now = new Date('2026-10-01T09:00:00Z');
const posting = {
  targetDepartmentIds: ['d1'],
  tagIds: ['sql', 'python'],
  minGrade: 2,
  maxGrade: 4,
};
const student = {
  departmentId: 'd1',
  entryYear: 2025,
  classOffset: 0,
  tagIds: ['sql', 'sql', 'excel'],
};
describe('ilan eşleştirme', () => {
  it('bölüm, sınıf ve eşik sağlanınca ortak etiketleri tekilleştirir', () => {
    expect(JOB_MATCH_THRESHOLDS.minimumSharedTags).toBe(1);
    expect(matchJobPosting(posting, student, now)).toEqual({
      matches: true,
      sharedTagIds: ['sql'],
    });
  });
  it.each([
    ['başka bölüm', { ...student, departmentId: 'd2' }],
    ['ortak etiket yok', { ...student, tagIds: ['excel'] }],
    ['sınıf eşiği altında', { ...student, entryYear: 2026 }],
    ['bilinmeyen sınıf', { ...student, entryYear: null }],
    ['hazırlık', { ...student, entryYear: 2026, classOffset: -1 }],
  ])('%s eşleşmez', (_label, input) => {
    expect(matchJobPosting(posting, input, now)).toEqual({ matches: false, sharedTagIds: [] });
  });
  it('akademik yılın İstanbul sınırında sınıf güncellenir', () => {
    const input = { ...student, entryYear: 2025 };
    expect(matchJobPosting(posting, input, new Date('2026-08-31T20:59:59Z')).matches).toBe(false);
    expect(matchJobPosting(posting, input, new Date('2026-08-31T21:00:00Z')).matches).toBe(true);
  });
  it('üçten küçük erişim tam sayı taşımaz', () => {
    expect(publicReach(2)).toEqual({ belowThreshold: true, count: null });
    expect(publicReach(3)).toEqual({ belowThreshold: false, count: 3 });
  });
});
