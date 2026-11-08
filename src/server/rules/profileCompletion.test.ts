import { describe, expect, it } from 'vitest';
import {
  computeProfileCompletion,
  computeProfileContentCompletion,
  finishOnboarding,
  isSkippableStep,
  markCompleted,
  markSkipped,
  nextOnboardingStep,
  stepStatuses,
  studentMentorEligibility,
  type StepLists,
} from './profileCompletion';
import { SKIPPABLE_STEPS, type CompletionField, type StepStatus } from '@/contracts/profile';

type Statuses = Record<CompletionField, StepStatus>;
const pending: Statuses = {
  MEMBERSHIP: 'PENDING',
  INTERESTS: 'PENDING',
  GOALS: 'PENDING',
  MENTOR_PREFERENCE: 'PENDING',
  VISIBILITY: 'PENDING',
};
const allDone: Statuses = {
  MEMBERSHIP: 'COMPLETED',
  INTERESTS: 'COMPLETED',
  GOALS: 'COMPLETED',
  MENTOR_PREFERENCE: 'COMPLETED',
  VISIBILITY: 'COMPLETED',
};
describe('profil tamamlama (uygulanabilir adımlar eşit ağırlıklı)', () => {
  it.each([
    [pending, true, 0, ['MEMBERSHIP', 'INTERESTS', 'GOALS', 'MENTOR_PREFERENCE', 'VISIBILITY']],
    [
      { ...pending, MEMBERSHIP: 'COMPLETED' },
      true,
      20,
      ['INTERESTS', 'GOALS', 'MENTOR_PREFERENCE', 'VISIBILITY'],
    ],
    [
      { ...pending, MEMBERSHIP: 'COMPLETED', INTERESTS: 'COMPLETED', GOALS: 'COMPLETED' },
      true,
      60,
      ['MENTOR_PREFERENCE', 'VISIBILITY'],
    ],
    [allDone, true, 100, []],
    // Atlanan adım eksiktir; atlama yüzdeyi artırmaz.
    [{ ...allDone, INTERESTS: 'SKIPPED', GOALS: 'SKIPPED' }, true, 60, ['INTERESTS', 'GOALS']],
    // Kapalı mentor adımı paydada yok (5 → 4), tamamlanmış/atlanmış olması fark etmez.
    [{ ...pending, MEMBERSHIP: 'COMPLETED' }, false, 25, ['INTERESTS', 'GOALS', 'VISIBILITY']],
    [{ ...allDone, MENTOR_PREFERENCE: 'SKIPPED' }, false, 100, []],
    [{ ...allDone, MENTOR_PREFERENCE: 'PENDING' }, false, 100, []],
    [{ ...allDone, VISIBILITY: 'SKIPPED' }, false, 75, ['VISIBILITY']],
  ] as const)('%o · mentor açık=%s → %%%d', (statuses, mentorStepAvailable, percent, missing) => {
    expect(computeProfileCompletion(statuses, { mentorStepAvailable })).toEqual({
      percent,
      missing,
    });
  });
});

describe('açık “atla” biçimi', () => {
  const none: StepLists = { completed: [], skipped: [] };

  it('listelerden durum: tamamlanan, atlanan, dokunulmayan', () => {
    expect(stepStatuses({ completed: ['MEMBERSHIP'], skipped: ['GOALS'] })).toEqual({
      ...pending,
      MEMBERSHIP: 'COMPLETED',
      GOALS: 'SKIPPED',
    });
  });

  it('atlama ↔ kaydetme son kararı tutar ve listeler ayrık kalır', () => {
    const skipped = markSkipped(markCompleted(none, 'INTERESTS'), 'INTERESTS');
    expect(skipped).toEqual({ completed: [], skipped: ['INTERESTS'] });
    const completed = markCompleted(skipped, 'INTERESTS');
    expect(completed).toEqual({ completed: ['INTERESTS'], skipped: [] });
    expect(markSkipped(markSkipped(none, 'GOALS'), 'GOALS').skipped).toEqual(['GOALS']);
  });

  it('zorunlu adım atlanabilir değildir; atlanabilir liste rol+bölüm dışındaki dört adımdır', () => {
    expect(isSkippableStep('MEMBERSHIP')).toBe(false);
    expect(isSkippableStep('COMPLETE')).toBe(false);
    expect([...SKIPPABLE_STEPS]).toEqual(['INTERESTS', 'GOALS', 'MENTOR_PREFERENCE', 'VISIBILITY']);
  });

  it('bitirme: zorunlu adım yoksa hata; varsa kalan PENDING adımlar SKIPPED olur, diğerleri korunur', () => {
    expect(finishOnboarding({ completed: ['INTERESTS'], skipped: [] })).toEqual({
      ok: false,
      errorCode: 'ONBOARDING_REQUIRED_STEP_PENDING',
    });
    const result = finishOnboarding({ completed: ['MEMBERSHIP', 'GOALS'], skipped: ['INTERESTS'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(stepStatuses(result.lists)).toEqual({
      MEMBERSHIP: 'COMPLETED',
      INTERESTS: 'SKIPPED',
      GOALS: 'COMPLETED',
      MENTOR_PREFERENCE: 'SKIPPED',
      VISIBILITY: 'SKIPPED',
    });
  });

  it("ilerleme noktası sıradaki adıma geçer ve COMPLETE'te durur", () => {
    expect(nextOnboardingStep('MEMBERSHIP')).toBe('INTERESTS');
    expect(nextOnboardingStep('VISIBILITY')).toBe('COMPLETE');
    expect(nextOnboardingStep('COMPLETE')).toBe('COMPLETE');
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

describe('computeProfileContentCompletion', () => {
  const done = {
    MEMBERSHIP: 'COMPLETED',
    INTERESTS: 'COMPLETED',
    GOALS: 'COMPLETED',
    MENTOR_PREFERENCE: 'COMPLETED',
    VISIBILITY: 'COMPLETED',
  } as const;
  const full = {
    onboarding: done,
    mentorStepAvailable: true,
    headline: 'A',
    city: 'B',
    educationCount: 1,
    skillCount: 3,
    cvApplied: true,
  };

  it('hepsi tamamsa %100 ve eksik yok', () => {
    expect(computeProfileContentCompletion(full)).toEqual({ percent: 100, missing: [] });
  });

  it.each([
    ['başlık yok', { headline: null }, 'BASICS'],
    ['şehir yok', { city: null }, 'BASICS'],
    ['eğitim yok', { educationCount: 0 }, 'EDUCATION'],
    ['2 beceri', { skillCount: 2 }, 'SKILLS'],
    ['CV yok', { cvApplied: false }, 'CV'],
  ] as const)('%s → %s eksik', (_name, patch, missing) => {
    const result = computeProfileContentCompletion({ ...full, ...patch });
    expect(result.missing).toEqual([missing]);
    expect(result.percent).toBe(89);
  });

  it('atlanan ya da bekleyen ilk giriş adımı eksiktir; mentor adımı açık değilse paydaya girmez', () => {
    const skipped = { ...done, GOALS: 'SKIPPED' as const, VISIBILITY: 'PENDING' as const };
    expect(computeProfileContentCompletion({ ...full, onboarding: skipped }).missing).toEqual([
      'GOALS',
      'VISIBILITY',
    ]);
    const noMentor = computeProfileContentCompletion({
      ...full,
      mentorStepAvailable: false,
      onboarding: { ...done, MENTOR_PREFERENCE: 'PENDING' },
    });
    expect(noMentor).toEqual({ percent: 100, missing: [] });
  });

  it('hiçbir şey yokken %0’a yakın ve uygulanabilir adımlar eşit ağırlıklıdır', () => {
    const empty = computeProfileContentCompletion({
      onboarding: {
        MEMBERSHIP: 'PENDING',
        INTERESTS: 'PENDING',
        GOALS: 'PENDING',
        MENTOR_PREFERENCE: 'PENDING',
        VISIBILITY: 'PENDING',
      },
      mentorStepAvailable: false,
      headline: null,
      city: null,
      educationCount: 0,
      skillCount: 0,
      cvApplied: false,
    });
    expect(empty.percent).toBe(0);
    expect(empty.missing).toHaveLength(8);
  });
});
