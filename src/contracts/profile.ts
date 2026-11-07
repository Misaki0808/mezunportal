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
export type OnboardingStepName = (typeof ONBOARDING_STEPS)[number];

/**
 * Adım durumu (PM kararı, açık “atla” biçimi):
 *  - `COMPLETED`: kullanıcı bir cevap kaydetti. `interested: false` da bir cevaptır (“tercih etmedim”).
 *  - `SKIPPED`: kullanıcı “atla” dedi. Atlama MEVCUT VERİYİ SİLMEZ (seçili etiketler, mentor tercihi
 *    olduğu gibi kalır) ama adım yüzdede eksik sayılır; sonradan kaydedilirse `COMPLETED` olur.
 *  - `PENDING`: hiç dokunulmadı.
 * Veritabanında `Profile.completedSteps` / `skippedSteps` (ayrık, CHECK'li); ikisinde de yoksa PENDING.
 */
export const STEP_STATUSES = ['COMPLETED', 'SKIPPED', 'PENDING'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/** Zorunlu adım (rol + bölüm beyanı) atlanamaz; P1-02 üyelik eylemiyle tamamlanır. */
export const REQUIRED_STEPS = ['MEMBERSHIP'] as const satisfies readonly CompletionField[];
export const SKIPPABLE_STEPS = [
  'INTERESTS',
  'GOALS',
  'MENTOR_PREFERENCE',
  'VISIBILITY',
] as const satisfies readonly CompletionField[];
export type SkippableStep = (typeof SKIPPABLE_STEPS)[number];
export const completionSchema = z.object({
  /** Uygulanabilir adımlar eşit ağırlıklı; SKIPPED ve PENDING eksiktir. */
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

/** Kaydetmek en az bir seçim ister; seçim yapmadan geçmek `skipOnboardingStep`'tir (boş liste atlama DEĞİL). */
const tagIds = z
  .array(z.string({ error: INVALID }).min(1, { error: INVALID }).max(64, { error: INVALID }), {
    error: INVALID,
  })
  .min(1, { error: INVALID })
  .max(20, { error: INVALID })
  .refine((ids) => new Set(ids).size === ids.length, { error: INVALID });
/**
 * Adımı kaydet → `COMPLETED` (atlanmışsa da). Üyelik ve görünürlük değerleri mevcut P1-02/P1-03
 * eylemleriyle kaydedilir; VISIBILITY burada yalnız “gördüm, onaylıyorum” kaydıdır. Rol/yetki istemciden
 * alınmaz. `COMPLETE`: ilk girişi bitirir; zorunlu adım tamamlanmamışsa `ONBOARDING_REQUIRED_STEP_PENDING`,
 * kalan PENDING atlanabilir adımlar `SKIPPED` olur (hepsini atlayıp bitirmek budur), veri silinmez.
 */
export const saveOnboardingStepSchema = z.discriminatedUnion('step', [
  z.object({ step: z.literal('INTERESTS'), tagIds }),
  z.object({ step: z.literal('GOALS'), tagIds }),
  z.object({ step: z.literal('MENTOR_PREFERENCE'), interested: z.boolean({ error: INVALID }) }),
  z.object({ step: z.literal('VISIBILITY'), confirmed: z.literal(true) }),
  z.object({ step: z.literal('COMPLETE') }),
]);
export type SaveOnboardingStepInput = z.input<typeof saveOnboardingStepSchema>;

/**
 * Adımı atla → `SKIPPED`. Zorunlu adım ve `COMPLETE` şemada yoktur (`VALIDATION_INVALID`). Kayıtlı veri
 * silinmez; ilerleme noktası (`step`) bir sonraki adıma geçer ve kalıcıdır. Daha önce `COMPLETED` olan
 * adım atlanırsa `SKIPPED` olur (kullanıcının son kararı geçerlidir), verisi yine durur.
 */
export const skipOnboardingStepSchema = z.object({
  step: z.enum(SKIPPABLE_STEPS, { error: INVALID }),
});
export type SkipOnboardingStepInput = z.input<typeof skipOnboardingStepSchema>;

export const onboardingStepStateSchema = z.object({
  step: z.enum(COMPLETION_FIELDS),
  status: z.enum(STEP_STATUSES),
  skippable: z.boolean(),
  /** false: adım bu kullanıcıya açık değil (ör. mentor eşiği); yüzdenin paydasına ve eksiklere girmez. */
  applicable: z.boolean(),
});
export type OnboardingStepState = z.infer<typeof onboardingStepStateSchema>;
export const onboardingStateSchema = z.object({
  /** Kalıcı ilerleme noktası: kullanıcı kaldığı adımdan devam eder. */
  step: z.enum(ONBOARDING_STEPS),
  /** `COMPLETION_FIELDS` sırasında, her adım tam bir kez. */
  steps: z.array(onboardingStepStateSchema).length(COMPLETION_FIELDS.length),
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
    'ONBOARDING_REQUIRED_STEP_PENDING',
  ],
  skipOnboardingStep: ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED', 'VALIDATION_INVALID'],
} as const satisfies Record<string, readonly ErrorCode[]>;
