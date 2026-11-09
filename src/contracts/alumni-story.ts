import { z } from 'zod';
import { adminId, adminReason } from './admin';

const INVALID = 'VALIDATION_INVALID';
export const STORY_MIN_LENGTH = 50;
export const STORY_MAX_LENGTH = 3000;
export const STORY_CONSENT_VERSION = 'taslak-1';
export const STORY_STATUSES = ['DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED'] as const;
export const monthSchema = z
  .string({ error: INVALID })
  .regex(/^(?:20\d{2}|2100)-(?:0[1-9]|1[0-2])$/, { error: INVALID });
export const saveStorySchema = z
  .object({
    departmentId: adminId,
    body: z
      .string({ error: INVALID })
      .trim()
      .min(STORY_MIN_LENGTH, { error: INVALID })
      .max(STORY_MAX_LENGTH, { error: INVALID }),
    consent: z.boolean({ error: INVALID }),
  })
  .strict();
export const storyIdSchema = z.object({ storyId: adminId }).strict();
export const storyConsentSchema = storyIdSchema
  .extend({ consent: z.boolean({ error: INVALID }) })
  .strict();
export const reviewStorySchema = storyIdSchema
  .extend({
    decision: z.enum(['PUBLISH', 'REJECT'], { error: INVALID }),
    reason: adminReason.optional(),
  })
  .strict()
  .refine((v) => v.decision !== 'REJECT' || !!v.reason, { error: INVALID, path: ['reason'] });
export const monthlySelectionSchema = z
  .object({ departmentId: adminId, storyId: adminId, month: monthSchema, reason: adminReason })
  .strict();
export const storiesScopeSchema = z.object({ departmentId: adminId }).strict();
export type SaveStoryInput = z.input<typeof saveStorySchema>;
export type StoryIdInput = z.input<typeof storyIdSchema>;
export type StoryConsentInput = z.input<typeof storyConsentSchema>;
export type ReviewStoryInput = z.input<typeof reviewStorySchema>;
export type MonthlySelectionInput = z.input<typeof monthlySelectionSchema>;
export type StoriesScopeInput = z.input<typeof storiesScopeSchema>;
export const myStorySchema = z
  .object({
    id: z.string(),
    departmentId: z.string(),
    department: z.string(),
    body: z.string(),
    status: z.enum(STORY_STATUSES),
    consent: z.boolean(),
    moderationReason: z.string().nullable(),
    updatedAt: z.date(),
  })
  .strict();
export type MyStory = z.infer<typeof myStorySchema>;
export const publishedStorySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    department: z.string(),
    body: z.string(),
    month: monthSchema,
  })
  .strict();
export type PublishedStory = z.infer<typeof publishedStorySchema>;
export const moderationStorySchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    departmentId: z.string(),
    department: z.string(),
    body: z.string(),
    status: z.enum(STORY_STATUSES),
    consent: z.boolean(),
    points: z.number().int().nullable(),
    suspicious: z.boolean(),
  })
  .strict();
export type ModerationStory = z.infer<typeof moderationStorySchema>;
export const STORY_ACTION_ACCESS = {
  listMyStories: 'ALUMNI',
  saveStory: 'ALUMNI',
  setStoryConsent: 'ALUMNI',
  submitStory: 'ALUMNI',
  listStoryModeration: 'ANY_ADMIN',
  reviewStory: 'ANY_ADMIN',
  selectMonthlyAlumnus: 'ANY_ADMIN',
  listPublishedStories: 'MEMBER',
  getPublishedStory: 'MEMBER',
  getCurrentStory: 'MEMBER',
} as const;
