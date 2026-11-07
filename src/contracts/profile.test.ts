import { describe, expect, it } from 'vitest';
import { OnboardingStep, TagKind } from '@/generated/prisma/enums';
import {
  ONBOARDING_STEPS,
  TAG_KINDS,
  listProfileTagsSchema,
  mentorEligibilitySchema,
  onboardingStateSchema,
  saveOnboardingStepSchema,
  skipOnboardingStepSchema,
} from './profile';

describe('P1-04 sözleşmesi', () => {
  it('adımlar ve etiket türleri Prisma ile eşleşir', () => {
    expect([...ONBOARDING_STEPS].sort()).toEqual(Object.values(OnboardingStep).sort());
    expect([...TAG_KINDS].sort()).toEqual(Object.values(TagKind).sort());
  });
  it('etiket seçiminde tekrarları ve geçersiz türü reddeder', () => {
    expect(
      saveOnboardingStepSchema.safeParse({ step: 'INTERESTS', tagIds: ['x', 'x'] }).success,
    ).toBe(false);
    expect(listProfileTagsSchema.safeParse({ kind: 'WRONG' }).success).toBe(false);
    expect(saveOnboardingStepSchema.safeParse({ step: 'GOALS', tagIds: ['x'] }).success).toBe(true);
  });
  it('mentor kararı ve gerekçesi tutarlı olmak zorundadır', () => {
    expect(
      mentorEligibilitySchema.safeParse({ eligible: true, reason: 'NOT_UPPER_CLASS' }).success,
    ).toBe(false);
    expect(
      mentorEligibilitySchema.safeParse({ eligible: false, reason: 'EXPERIENCE_UNAVAILABLE' })
        .success,
    ).toBe(true);
  });
  it('boş etiket listesi kaydetme değildir; seçim yapmadan geçmek atlama eylemidir', () => {
    expect(saveOnboardingStepSchema.safeParse({ step: 'INTERESTS', tagIds: [] }).success).toBe(
      false,
    );
    expect(skipOnboardingStepSchema.safeParse({ step: 'INTERESTS' }).success).toBe(true);
  });
  it('“tercih etmedim” bir cevaptır (kaydedilir), atlama değildir', () => {
    expect(
      saveOnboardingStepSchema.safeParse({ step: 'MENTOR_PREFERENCE', interested: false }).success,
    ).toBe(true);
  });
  it.each(['MEMBERSHIP', 'COMPLETE', 'WRONG'])('%s atlanamaz', (step) => {
    const result = skipOnboardingStepSchema.safeParse({ step });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('VALIDATION_INVALID');
  });
  it('durum yanıtı her adımı tam bir kez ve açık durumla taşır', () => {
    const base = {
      step: 'GOALS',
      interestTagIds: ['t1'],
      goalTagIds: [],
      mentorInterested: null,
      completion: { percent: 25, missing: ['GOALS', 'MENTOR_PREFERENCE', 'VISIBILITY'] },
      studentMentorEligibility: null,
    };
    const steps = [
      { step: 'MEMBERSHIP', status: 'COMPLETED', skippable: false, applicable: true },
      { step: 'INTERESTS', status: 'SKIPPED', skippable: true, applicable: true },
      { step: 'GOALS', status: 'PENDING', skippable: true, applicable: true },
      { step: 'MENTOR_PREFERENCE', status: 'PENDING', skippable: true, applicable: false },
      { step: 'VISIBILITY', status: 'PENDING', skippable: true, applicable: true },
    ];
    expect(onboardingStateSchema.safeParse({ ...base, steps }).success).toBe(true);
    expect(onboardingStateSchema.safeParse({ ...base, steps: steps.slice(1) }).success).toBe(false);
    expect(
      onboardingStateSchema.safeParse({
        ...base,
        steps: [{ ...steps[0], status: 'DONE' }, ...steps.slice(1)],
      }).success,
    ).toBe(false);
  });
});
