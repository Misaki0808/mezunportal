import { z } from 'zod';
import type { ActionResult } from './result';
import { adminId, adminReason } from './admin';
import { POINT_ACTIONS } from './points';

/** P2-01: yıl, İstanbul akademik yılının başladığı takvim yılıdır. */
const INVALID = 'VALIDATION_INVALID';
const year = z.number({ error: INVALID }).int().min(2000).max(2100);
export const awardCycleInputSchema = z.object({ departmentId: adminId, year }).strict();
export const configureAwardCycleSchema = awardCycleInputSchema
  .extend({
    ceremonyDate: z.iso.date({ error: INVALID }),
  })
  .strict();
export const recalculateAwardCycleSchema = awardCycleInputSchema
  .extend({ reason: adminReason })
  .strict();
export const selectYearAlumnusSchema = awardCycleInputSchema
  .extend({ userId: adminId, reason: adminReason })
  .strict();
export const setAwardPublicationSchema = z
  .object({ awardId: adminId, public: z.boolean({ error: INVALID }) })
  .strict();
export type AwardCycleInput = z.input<typeof awardCycleInputSchema>;
export type ConfigureAwardCycleInput = z.input<typeof configureAwardCycleSchema>;
export type RecalculateAwardCycleInput = z.input<typeof recalculateAwardCycleSchema>;
export type SelectYearAlumnusInput = z.input<typeof selectYearAlumnusSchema>;
export type SetAwardPublicationInput = z.input<typeof setAwardPublicationSchema>;

export const awardCandidateSchema = z
  .object({
    userId: z.string(),
    name: z.string(),
    points: z.number().int(),
    experienceCount: z.number().int().nonnegative(),
    meetingCount: z.number().int().nonnegative(),
    breakdown: z.array(
      z.object({ action: z.enum(POINT_ACTIONS), points: z.number().int() }).strict(),
    ),
  })
  .strict();
export const awardCycleViewSchema = z
  .object({
    year,
    departmentId: z.string(),
    ceremonyDate: z.string(),
    frozenAt: z.date().nullable(),
    candidates: z.array(awardCandidateSchema),
    excludedForSuspicion: z.number().int().nonnegative(),
    selectedUserId: z.string().nullable(),
    selectedNeedsReview: z.boolean(),
  })
  .strict();
export type AwardCycleView = z.infer<typeof awardCycleViewSchema>;
export const myAwardSchema = z
  .object({
    id: z.string(),
    department: z.string(),
    university: z.string(),
    year,
    createdAt: z.date(),
    isPublic: z.boolean(),
    verificationUrl: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
  })
  .strict();
export type MyAward = z.infer<typeof myAwardSchema>;
/** Public output deliberately excludes identifiers, contact details, points and other profile data. */
export const publicAwardSchema = z
  .object({
    name: z.string(),
    award: z.string(),
    department: z.string(),
    year,
    university: z.string(),
  })
  .strict();
export type PublicAward = z.infer<typeof publicAwardSchema>;
export const YEAR_ALUMNI_ACTION_ACCESS = {
  configureAwardCycle: 'ANY_ADMIN',
  listAwardCandidates: 'ANY_ADMIN',
  recalculateAwardCycle: 'ANY_ADMIN',
  selectYearAlumnus: 'ANY_ADMIN',
  listMyAwards: 'ALUMNI',
  setAwardPublication: 'ALUMNI',
} as const;

/** Sunucu eylemi imzaları; istemci kimlik ve yetki bilgisini belirlemez. */
export type YearAlumniActions = {
  configureAwardCycle: (input: ConfigureAwardCycleInput) => Promise<ActionResult<AwardCycleView>>;
  listAwardCandidates: (input: AwardCycleInput) => Promise<ActionResult<AwardCycleView>>;
  recalculateAwardCycle: (
    input: RecalculateAwardCycleInput,
  ) => Promise<ActionResult<AwardCycleView>>;
  selectYearAlumnus: (input: SelectYearAlumnusInput) => Promise<ActionResult<{ awardId: string }>>;
  listMyAwards: () => Promise<ActionResult<MyAward[]>>;
  setAwardPublication: (input: SetAwardPublicationInput) => Promise<ActionResult<MyAward>>;
};

/** Genel oturum/rıza kapısından gerekçeli kamuya açık sayfa istisnası. */
export const YEAR_ALUMNI_PUBLIC_PAGE_ACCESS = {
  '/dogrula/[kod]': {
    access: 'PUBLIC',
    reason:
      'Only current, award-specific publication consent exposes the limited verification fields.',
  },
} as const;
