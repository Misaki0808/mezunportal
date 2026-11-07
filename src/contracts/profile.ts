import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;
export const ONBOARDING_STEPS = [
  'MEMBERSHIP',
  'INTERESTS',
  'GOALS',
  'MENTOR_PREFERENCE',
  'VISIBILITY',
  'COMPLETE',
] as const;
export const TAG_KINDS = ['INTEREST', 'SKILL', 'GOAL'] as const;
export const COMPLETION_FIELDS = [
  'MEMBERSHIP',
  'INTERESTS',
  'GOALS',
  'MENTOR_PREFERENCE',
  'VISIBILITY',
] as const;
export type CompletionField = (typeof COMPLETION_FIELDS)[number];
export const completionSchema = z.object({
  percent: z.number().int().min(0).max(100),
  missing: z.array(z.enum(COMPLETION_FIELDS)),
});
export type ProfileCompletion = z.infer<typeof completionSchema>;

export const mentorEligibilitySchema = z.discriminatedUnion('eligible', [
  z.object({ eligible: z.literal(true), reason: z.null() }),
  z.object({
    eligible: z.literal(false),
    reason: z.enum(['NOT_UPPER_CLASS', 'PUBLISHED_EXPERIENCE_REQUIRED', 'EXPERIENCE_UNAVAILABLE']),
  }),
]);
export type MentorEligibility = z.infer<typeof mentorEligibilitySchema>;

export const profileTagSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(TAG_KINDS),
  slug: z.string().min(1),
});
export const listProfileTagsSchema = z.object({ kind: z.enum(TAG_KINDS) });
export type ListProfileTagsInput = z.input<typeof listProfileTagsSchema>;
export const profileTagsOutputSchema = z.object({ tags: z.array(profileTagSchema) });
export type ProfileTagsOutput = z.infer<typeof profileTagsOutputSchema>;

const tagIds = z
  .array(z.string({ error: INVALID }).min(1).max(64), { error: INVALID })
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length, { error: INVALID });
/** Üyelik ve görünürlük mevcut P1-02/P1-03 eylemleriyle kaydedilir; rol/yetki istemciden alınmaz. */
export const saveOnboardingStepSchema = z.discriminatedUnion('step', [
  z.object({ step: z.literal('INTERESTS'), tagIds }),
  z.object({ step: z.literal('GOALS'), tagIds }),
  z.object({ step: z.literal('MENTOR_PREFERENCE'), interested: z.boolean({ error: INVALID }) }),
  z.object({ step: z.literal('VISIBILITY'), confirmed: z.literal(true) }),
  z.object({ step: z.literal('COMPLETE') }),
]);
export type SaveOnboardingStepInput = z.input<typeof saveOnboardingStepSchema>;
export const onboardingStateSchema = z.object({
  step: z.enum(ONBOARDING_STEPS),
  interestTagIds: z.array(z.string()),
  goalTagIds: z.array(z.string()),
  mentorInterested: z.boolean().nullable(),
  completion: completionSchema,
  studentMentorEligibility: mentorEligibilitySchema.nullable(),
});
export type OnboardingState = z.infer<typeof onboardingStateSchema>;

export const PROFILE_ACTION_ERRORS = {
  getOnboardingState: ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED'],
  listProfileTags: ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED', 'VALIDATION_INVALID'],
  saveOnboardingStep: [
    'AUTH_UNAUTHENTICATED',
    'AUTH_ACCOUNT_SUSPENDED',
    'VALIDATION_INVALID',
    'PROFILE_TAG_INVALID',
    'MENTOR_NOT_ELIGIBLE',
  ],
} as const satisfies Record<string, readonly ErrorCode[]>;
