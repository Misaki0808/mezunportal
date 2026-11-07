import { describe, expect, it } from 'vitest';
import { computeProfileCompletion, studentMentorEligibility } from './profileCompletion';
import type { CompletionField } from '@/contracts/profile';

const empty: Record<CompletionField, boolean> = {
  MEMBERSHIP: false,
  INTERESTS: false,
  GOALS: false,
  MENTOR_PREFERENCE: false,
  VISIBILITY: false,
};
describe('profil tamamlama (uygulanabilir adımlar eşit ağırlıklı)', () => {
  it.each([
    [empty, 0, 5],
    [{ ...empty, MEMBERSHIP: true }, 20, 4],
    [{ ...empty, MEMBERSHIP: true, INTERESTS: true, GOALS: true }, 60, 2],
    [
      { MEMBERSHIP: true, INTERESTS: true, GOALS: true, MENTOR_PREFERENCE: true, VISIBILITY: true },
      100,
      0,
    ],
  ])('tamamlanan adımlardan yüzde ve eksikleri hesaplar', (input, percent, missing) => {
    expect(computeProfileCompletion(input, { mentorStepAvailable: true })).toMatchObject({
      percent,
    });
    expect(computeProfileCompletion(input, { mentorStepAvailable: true }).missing).toHaveLength(
      missing,
    );
  });
  it('kapalı mentor adımını payda ve eksiklerden çıkarır; atlanabilen adım eksik kalır', () => {
    const result = computeProfileCompletion(
      { ...empty, MEMBERSHIP: true },
      { mentorStepAvailable: false },
    );
    expect(result).toEqual({ percent: 25, missing: ['INTERESTS', 'GOALS', 'VISIBILITY'] });
    expect(
      computeProfileCompletion(
        { ...empty, MEMBERSHIP: true, INTERESTS: true, GOALS: true, VISIBILITY: true },
        { mentorStepAvailable: false },
      ).percent,
    ).toBe(100);
  });
});
describe('öğrenci mentor eşiği K-08', () => {
  it.each([
    [{ kind: 'PREPARATORY' } as const, 10, false, 'NOT_UPPER_CLASS'],
    [{ kind: 'GRADE', grade: 2, extended: false } as const, 2, false, 'NOT_UPPER_CLASS'],
    [{ kind: 'GRADE', grade: 3, extended: false } as const, null, false, 'EXPERIENCE_UNAVAILABLE'],
    [
      { kind: 'GRADE', grade: 3, extended: false } as const,
      0,
      false,
      'PUBLISHED_EXPERIENCE_REQUIRED',
    ],
    [{ kind: 'GRADE', grade: 3, extended: false } as const, 1, true, null],
    [{ kind: 'GRADE', grade: 5, extended: true } as const, 1, true, null],
  ])('sınıf ve yayınlanmış deneyimi birlikte arar', (standing, count, eligible, reason) => {
    expect(studentMentorEligibility(standing, count)).toEqual({ eligible, reason });
  });
});
