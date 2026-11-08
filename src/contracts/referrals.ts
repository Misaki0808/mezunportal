import { z } from 'zod';
import type { ErrorCode } from '@/lib/errors';
import { adminId, adminPageInput, adminReason } from './admin';

/** P2-03: yalnız onaylı iletişim veya tamamlanmış görüşmeyle tanınan öğrenci seçilebilir. */
const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;
export const REFERRAL_NOTE_MAX = 500;
export const REFERRAL_ORGANIZATION_MAX = 120;
export const REFERRAL_DELAY_DAYS = 14;
export const REFERRAL_DEFAULT_POINTS = { REFERRAL_GIVEN: 20, REFERRAL_ACCEPTED: 30 } as const;
export const REFERRAL_STATUSES = [
  'PROPOSED',
  'STUDENT_CONFIRMED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'ACCEPTED_PROPOSED',
  'ACCEPTED_ALUMNI_CONFIRMED',
  'ACCEPTED_APPROVED',
  'ACCEPTED_REJECTED',
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export const REFERRAL_HREFS = {
  mine: '/hesap/referanslar',
  create: '/referans/yeni',
  moderation: '/yonetim/referanslar',
} as const;
const note = z
  .string({ error: INVALID })
  .trim()
  .max(REFERRAL_NOTE_MAX, { error: INVALID })
  .transform((v) => v || null)
  .nullable()
  .optional();
export const referralCandidateSchema = z
  .object({ id: z.string(), name: z.string(), departmentName: z.string() })
  .strict();
export type ReferralCandidate = z.infer<typeof referralCandidateSchema>;
export const listReferralCandidatesSchema = z.object({}).strict();
export const referralCandidatesSchema = z
  .object({ students: z.array(referralCandidateSchema) })
  .strict();
export type ReferralCandidates = z.infer<typeof referralCandidatesSchema>;
export const proposeReferralSchema = z
  .object({
    studentId: adminId,
    jobPostingId: adminId.nullable().optional(),
    organizationName: z
      .string({ error: INVALID })
      .trim()
      .min(2, { error: INVALID })
      .max(REFERRAL_ORGANIZATION_MAX, { error: INVALID })
      .nullable()
      .optional(),
    note,
  })
  .strict()
  .refine((x) => !!x.jobPostingId || !!x.organizationName, {
    error: INVALID,
    path: ['organizationName'],
  });
export type ProposeReferralInput = z.input<typeof proposeReferralSchema>;
export const referralIdSchema = z.object({ referralId: adminId }).strict();
export type ReferralIdInput = z.input<typeof referralIdSchema>;
export const respondReferralSchema = referralIdSchema
  .extend({ decision: z.enum(['CONFIRM', 'REJECT'], { error: INVALID }) })
  .strict();
export type RespondReferralInput = z.input<typeof respondReferralSchema>;
export const proposeReferralAcceptanceSchema = referralIdSchema.extend({ note }).strict();
export type ProposeReferralAcceptanceInput = z.input<typeof proposeReferralAcceptanceSchema>;
export const reviewReferralSchema = referralIdSchema
  .extend({
    stage: z.enum(['REFERRAL', 'ACCEPTANCE'], { error: INVALID }),
    decision: z.enum(['APPROVE', 'REJECT'], { error: INVALID }),
    reason: adminReason.optional(),
  })
  .strict()
  .refine((x) => x.decision !== 'REJECT' || !!x.reason, { error: INVALID, path: ['reason'] });
export type ReviewReferralInput = z.input<typeof reviewReferralSchema>;
export const listReferralsSchema = z
  .object({
    status: z.enum(REFERRAL_STATUSES).optional(),
    cursor: adminPageInput.cursor,
    limit: adminPageInput.limit,
  })
  .strict();
export type ListReferralsInput = z.input<typeof listReferralsSchema>;
export const referralViewSchema = z
  .object({
    id: z.string(),
    status: z.enum(REFERRAL_STATUSES),
    alumnus: z.object({ id: z.string(), name: z.string() }).strict(),
    student: z.object({ id: z.string(), name: z.string() }).strict(),
    department: z.object({ id: z.string(), name: z.string() }).strict(),
    organizationName: z.string().nullable(),
    jobPostingId: z.string().nullable(),
    note: z.string().nullable(),
    acceptanceNote: z.string().nullable(),
    /** Öğrenci reddinde gerekçe yoktur; yönetici ret gerekçesi yalnız taraflara gösterilir. */
    decisionReason: z.string().nullable(),
    acceptanceReason: z.string().nullable(),
    createdAt: z.date(),
    studentConfirmedAt: z.date().nullable(),
    approvedAt: z.date().nullable(),
    acceptanceProposedAt: z.date().nullable(),
    alumniConfirmedAt: z.date().nullable(),
    acceptanceApprovedAt: z.date().nullable(),
  })
  .strict();
export type ReferralView = z.infer<typeof referralViewSchema>;
export const referralPageSchema = z
  .object({ items: z.array(referralViewSchema), nextCursor: z.string().nullable() })
  .strict();
export type ReferralPage = z.infer<typeof referralPageSchema>;
export const referralResultSchema = z
  .object({ referralId: z.string(), status: z.enum(REFERRAL_STATUSES) })
  .strict();
export type ReferralResult = z.infer<typeof referralResultSchema>;
export const REFERRAL_ACTION_ACCESS = {
  listReferralCandidates: 'ALUMNI',
  proposeReferral: 'ALUMNI',
  listMyReferrals: 'MEMBER',
  respondReferral: 'STUDENT',
  proposeReferralAcceptance: 'STUDENT',
  respondReferralAcceptance: 'ALUMNI',
  listReferralModeration: 'ANY_ADMIN',
  reviewReferral: 'ANY_ADMIN',
  cancelReferral: 'ALUMNI',
} as const;

const REFERRAL_AUTH_ERRORS = [
  'AUTH_UNAUTHENTICATED',
  'AUTH_ACCOUNT_SUSPENDED',
  'AUTH_NOT_VERIFIED',
  'AUTH_FORBIDDEN',
  'CONSENT_REQUIRED',
] as const satisfies readonly ErrorCode[];
const REFERRAL_COMMON_ERRORS = [
  ...REFERRAL_AUTH_ERRORS,
  'VALIDATION_INVALID',
  'RESOURCE_NOT_FOUND',
  'REFERRAL_INVALID_STATE',
] as const satisfies readonly ErrorCode[];
export const REFERRAL_ACTION_ERRORS = {
  listReferralCandidates: REFERRAL_AUTH_ERRORS,
  proposeReferral: [...REFERRAL_COMMON_ERRORS, 'REFERRAL_NOT_ELIGIBLE'],
  listMyReferrals: REFERRAL_COMMON_ERRORS,
  respondReferral: REFERRAL_COMMON_ERRORS,
  proposeReferralAcceptance: REFERRAL_COMMON_ERRORS,
  respondReferralAcceptance: REFERRAL_COMMON_ERRORS,
  listReferralModeration: REFERRAL_COMMON_ERRORS,
  reviewReferral: REFERRAL_COMMON_ERRORS,
  cancelReferral: [...REFERRAL_COMMON_ERRORS, 'REFERRAL_CANCEL_WINDOW_CLOSED'],
} as const satisfies Record<keyof typeof REFERRAL_ACTION_ACCESS, readonly ErrorCode[]>;
