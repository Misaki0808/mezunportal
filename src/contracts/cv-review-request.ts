import { z } from 'zod';

/**
 * P1-15 mentor CV incelemesi sözleşmesi. Kimlik oturumdan alınır. Açık talep
 * mentorun yalnız ilişkili dosyaya erişimini sağlar; COMPLETED/EXPIRED anında
 * bu yetki sona erer. Dosya sahibi, açık talep boyunca eski CV'yi korur.
 *
 * P1-16 entegrasyonu: CvReviewRequest kaydında id, studentId, mentorId,
 * status, answeredAt, helpfulAt bulunur. Puan olayı yalnız COMPLETED ve
 * helpfulAt dolu olduğunda, talep id'si ile tekilleştirilerek yazılmalıdır.
 * Sadece öğrencinin işlemi helpfulAt alanını ilk kez doldurabilir.
 */
export const CV_REVIEW_STATUSES = ['OPEN', 'COMPLETED', 'EXPIRED'] as const;
export type CvReviewRequestStatus = (typeof CV_REVIEW_STATUSES)[number];
export const CV_REVIEW_EXPIRY_DAYS = 14;
export const CV_REVIEW_NOTE_MAX = 500;
export const CV_REVIEW_COMMENT_MAX = 3000;
export const CV_REVIEW_MONTHLY_LIMIT_MAX = 100;

const id = z.string({ error: 'VALIDATION_INVALID' }).trim().min(1).max(64);
const text = (min: number, max: number) =>
  z.string({ error: 'VALIDATION_INVALID' }).trim().min(min).max(max);

export const cvReviewSettingsSchema = z
  .object({
    enabled: z.boolean(),
    monthlyLimit: z.number().int().min(0).max(CV_REVIEW_MONTHLY_LIMIT_MAX),
  })
  .strict();
export type CvReviewSettings = z.input<typeof cvReviewSettingsSchema>;
export const cvReviewTargetSchema = z.object({ mentorId: id }).strict();
export const createCvReviewRequestSchema = z
  .object({ mentorId: id, note: text(1, CV_REVIEW_NOTE_MAX) })
  .strict();
export type CreateCvReviewRequestInput = z.input<typeof createCvReviewRequestSchema>;
export const cvReviewRequestIdSchema = z.object({ requestId: id }).strict();
export const answerCvReviewRequestSchema = z
  .object({ requestId: id, comment: text(1, CV_REVIEW_COMMENT_MAX) })
  .strict();
export type AnswerCvReviewRequestInput = z.input<typeof answerCvReviewRequestSchema>;
export const listCvReviewRequestsSchema = z
  .object({
    role: z.enum(['MENTOR', 'STUDENT']),
    cursor: id.optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export type ListCvReviewRequestsInput = z.input<typeof listCvReviewRequestsSchema>;

export const CV_REVIEW_UNAVAILABLE_REASONS = [
  'NOT_MENTOR',
  'SELF',
  'DISABLED',
  'MONTHLY_LIMIT',
  'NO_CV',
  'OPEN_REQUEST_EXISTS',
] as const;
export const cvReviewAvailabilitySchema = z
  .object({
    available: z.boolean(),
    reason: z.enum(CV_REVIEW_UNAVAILABLE_REASONS).nullable(),
  })
  .strict();
export type CvReviewAvailability = z.infer<typeof cvReviewAvailabilitySchema>;

export const cvReviewRequestViewSchema = z
  .object({
    id: z.string(),
    status: z.enum(CV_REVIEW_STATUSES),
    role: z.enum(['MENTOR', 'STUDENT']),
    counterpart: z.object({ userId: z.string(), displayName: z.string() }).strict(),
    note: z.string(),
    comment: z.string().nullable(),
    createdAt: z.date(),
    expiresAt: z.date(),
    answeredAt: z.date().nullable(),
    helpfulAt: z.date().nullable(),
    actions: z
      .object({ canAnswer: z.boolean(), canMarkHelpful: z.boolean(), canViewCv: z.boolean() })
      .strict(),
  })
  .strict();
export type CvReviewRequestView = z.infer<typeof cvReviewRequestViewSchema>;
export const cvReviewRequestPageSchema = z
  .object({
    items: z.array(cvReviewRequestViewSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type CvReviewRequestPage = z.infer<typeof cvReviewRequestPageSchema>;
export const cvReviewFileHref = (requestId: string) =>
  `/api/cv-inceleme/${encodeURIComponent(requestId)}/dosya`;
