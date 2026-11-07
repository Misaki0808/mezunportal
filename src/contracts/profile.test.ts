import { describe, expect, it } from 'vitest';
import { OnboardingStep, TagKind } from '@/generated/prisma/enums';
import {
  ONBOARDING_STEPS,
  TAG_KINDS,
  listProfileTagsSchema,
  mentorEligibilitySchema,
  saveOnboardingStepSchema,
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
});
