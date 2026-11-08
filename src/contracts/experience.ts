import { z } from 'zod';
import type { ErrorCode } from '@/lib/errors';

/** P1-07 sözleşmesi: kimlik/yayın/yetki sunucuya aittir; servis ve ekran bu imzaları paylaşır. */
const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;
export const EXPERIENCE_TYPES = [
  'INTERNSHIP',
  'ERASMUS',
  'COMPETITION',
  'HACKATHON',
  'CLUB',
  'CERTIFICATE',
  'GRADUATE_STUDY',
  'STUDY_ABROAD',
] as const;
export const EXPERIENCE_STATUSES = ['DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED'] as const;
export const TERM_SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const;
export const EXPERIENCE_PAY = ['PAID', 'UNPAID', 'NOT_DISCLOSED'] as const;
export const APPLICATION_CHANNELS = [
  'LINKEDIN_POST',
  'CAREER_PLATFORM',
  'COMPANY_SITE',
  'REFERRAL',
  'CAREER_FAIR',
  'COLD_EMAIL',
  'UNIVERSITY_ANNOUNCEMENT',
  'OTHER',
] as const;
export const REPORT_TARGET_TYPES = ['EXPERIENCE'] as const;
export const REPORT_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;
/** K-07: aynı üniversitedeki etkin, doğrulanmış üyelik; bölüm/fakülte sınırı YOK. Servis zorlar. */
export const EXPERIENCE_READ_SCOPE = 'VERIFIED_UNIVERSITY_MEMBERS' as const;
/** Kullanıcı başına 24 saatte 10 şikâyet; süreçler arası sayaç P1-07 servisinde RateLimit'e bağlanır. */
export const EXPERIENCE_REPORT_RATE_LIMIT = { maxRequests: 10, windowSeconds: 86_400 } as const;

const id = z
  .string({ error: INVALID })
  .trim()
  .min(1, { error: INVALID })
  .max(64, { error: INVALID });
const shortText = z
  .string({ error: INVALID })
  .trim()
  .min(1, { error: INVALID })
  .max(200, { error: INVALID });
const bodyText = z
  .string({ error: INVALID })
  .trim()
  .min(1, { error: INVALID })
  .max(10_000, { error: INVALID });
const year = z
  .number({ error: INVALID })
  .int({ error: INVALID })
  .min(1900, { error: INVALID })
  .max(2100, { error: INVALID });
const duration = z
  .number({ error: INVALID })
  .int({ error: INVALID })
  .min(1, { error: INVALID })
  .max(520, { error: INVALID });
export const processStepSchema = z
  .object({
    title: shortText,
    description: z
      .string({ error: INVALID })
      .trim()
      .min(1, { error: INVALID })
      .max(2000, { error: INVALID }),
  })
  .strict();
const processSteps = z.array(processStepSchema, { error: INVALID }).max(20, { error: INVALID });
const interviewQuestions = z
  .array(
    z.string({ error: INVALID }).trim().min(1, { error: INVALID }).max(1000, { error: INVALID }),
    { error: INVALID },
  )
  .max(20, { error: INVALID });
const common = {
  organizationName: shortText,
  termYear: year,
  termSeason: z.enum(TERM_SEASONS, { error: INVALID }),
  whatLearned: bodyText,
  advice: bodyText,
};
const location = { country: shortText.optional(), city: shortText.optional() };
const application = {
  applicationChannel: z.enum(APPLICATION_CHANNELS, { error: INVALID }),
  processSteps,
};

/** D9: tür değişince kabul edilen alanlar değişir; yabancı tür alanları sessizce atılmaz, reddedilir. */
const templates = [
  z
    .object({
      type: z.literal('INTERNSHIP'),
      ...common,
      ...location,
      companyId: id.optional(),
      durationWeeks: duration,
      pay: z.enum(EXPERIENCE_PAY, { error: INVALID }),
      ...application,
      interviewQuestions,
    })
    .strict(),
  z
    .object({
      type: z.literal('ERASMUS'),
      ...common,
      country: shortText,
      city: shortText.optional(),
      durationWeeks: duration,
      ...application,
    })
    .strict(),
  z
    .object({
      type: z.literal('COMPETITION'),
      ...common,
      ...location,
      durationWeeks: duration.optional(),
      ...application,
    })
    .strict(),
  z
    .object({
      type: z.literal('HACKATHON'),
      ...common,
      ...location,
      durationWeeks: duration.optional(),
      ...application,
    })
    .strict(),
  z
    .object({
      type: z.literal('CLUB'),
      ...common,
      city: shortText.optional(),
      durationWeeks: duration.optional(),
      processSteps,
    })
    .strict(),
  z
    .object({ type: z.literal('CERTIFICATE'), ...common, durationWeeks: duration.optional() })
    .strict(),
  z
    .object({
      type: z.literal('GRADUATE_STUDY'),
      ...common,
      ...location,
      durationWeeks: duration.optional(),
      ...application,
      interviewQuestions,
    })
    .strict(),
  z
    .object({
      type: z.literal('STUDY_ABROAD'),
      ...common,
      country: shortText,
      city: shortText.optional(),
      durationWeeks: duration,
      ...application,
    })
    .strict(),
] as const;
export const experienceTemplateSchema = z.discriminatedUnion('type', templates, { error: INVALID });
export type ExperienceTemplate = z.infer<typeof experienceTemplateSchema>;
/** Taslak türü zorunlu, diğer alanlar isteğe bağlıdır; sınırlar ve tür-alan eşleşmesi değişmez. */
export const experienceDraftTemplateSchema = z.discriminatedUnion(
  'type',
  [
    templates[0].partial().required({ type: true }),
    templates[1].partial().required({ type: true }),
    templates[2].partial().required({ type: true }),
    templates[3].partial().required({ type: true }),
    templates[4].partial().required({ type: true }),
    templates[5].partial().required({ type: true }),
    templates[6].partial().required({ type: true }),
    templates[7].partial().required({ type: true }),
  ],
  { error: INVALID },
);
export type ExperienceDraftTemplate = z.infer<typeof experienceDraftTemplateSchema>;

export const saveExperienceDraftSchema = z
  .object({
    experienceId: id.optional(),
    /** Yeni kayıtta bu bölümde doğrulanmış üyelik sunucuda kontrol edilir; mevcut kaydın bölümü değişmez. */
    departmentId: id,
    content: experienceDraftTemplateSchema,
    isAnonymous: z.boolean({ error: INVALID }),
    /** P1-05/06 CV daveti: yalnız kullanıcının kendi Position kaydı; sahipliği servis kontrol eder. Çıktıya taşınmaz. */
    prefillPositionId: id.optional(),
  })
  .strict();
export type SaveExperienceDraftInput = z.input<typeof saveExperienceDraftSchema>;
export const experienceIdSchema = z.object({ experienceId: id }).strict();
export type ExperienceIdInput = z.input<typeof experienceIdSchema>;
/** Gönderme, DB'deki taslağı experienceTemplateSchema ile yeniden doğrular; istemciden yayın durumu alınmaz. */
export const submitExperienceSchema = experienceIdSchema;
export const reviewExperienceSchema = z.discriminatedUnion(
  'decision',
  [
    z.object({ experienceId: id, decision: z.literal('PUBLISH') }).strict(),
    z
      .object({
        experienceId: id,
        decision: z.literal('REJECT'),
        reason: z
          .string({ error: 'AUDIT_REASON_REQUIRED' })
          .trim()
          .min(1, { error: 'AUDIT_REASON_REQUIRED' })
          .min(3, { error: 'AUDIT_REASON_INVALID' })
          .max(1000, { error: 'AUDIT_REASON_INVALID' }),
      })
      .strict(),
  ],
  { error: INVALID },
);
export type ReviewExperienceInput = z.input<typeof reviewExperienceSchema>;
const reason = z
  .string({ error: INVALID })
  .trim()
  .min(3, { error: INVALID })
  .max(1000, { error: INVALID });
export const reportExperienceSchema = z.object({ experienceId: id, reason }).strict();
export type ReportExperienceInput = z.input<typeof reportExperienceSchema>;
const pageInput = {
  cursor: id.optional(),
  limit: z
    .number({ error: INVALID })
    .int({ error: INVALID })
    .min(1, { error: INVALID })
    .max(50, { error: INVALID })
    .default(20),
};
export const listMyExperiencesSchema = z
  .object({ ...pageInput, status: z.enum(EXPERIENCE_STATUSES, { error: INVALID }).optional() })
  .strict();
export type ListMyExperiencesInput = z.input<typeof listMyExperiencesSchema>;
export const listModerationQueueSchema = z
  .object({ ...pageInput, departmentId: id.optional() })
  .strict();
export type ListModerationQueueInput = z.input<typeof listModerationQueueSchema>;
/** Bölüm filtresi yetki vermez; tüm liste sorguları canModerate/managedDepartmentIds kapsamıyla kesişir. */
export const listExperienceReportsSchema = z
  .object({
    ...pageInput,
    departmentId: id.optional(),
    status: z.enum(REPORT_STATUSES, { error: INVALID }).default('OPEN'),
  })
  .strict();
export type ListExperienceReportsInput = z.input<typeof listExperienceReportsSchema>;
export const resolveExperienceReportSchema = z
  .object({ reportId: id, decision: z.enum(['RESOLVED', 'DISMISSED'], { error: INVALID }), reason })
  .strict();
export type ResolveExperienceReportInput = z.input<typeof resolveExperienceReportSchema>;

const outputFields = {
  id: z.string(),
  departmentIdAtWrite: z.string(),
  content: experienceDraftTemplateSchema,
  status: z.enum(EXPERIENCE_STATUSES),
  moderationNote: z.string().nullable(),
  publishedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
};
/** Anonim dalın TİPİNDE author/authorId/userId yoktur; moderasyon ve kendi listesi de aynı dalı kullanır. */
export const anonymousExperienceSchema = z
  .object({ ...outputFields, isAnonymous: z.literal(true) })
  .strict();
export const namedExperienceSchema = z
  .object({
    ...outputFields,
    isAnonymous: z.literal(false),
    author: z.object({ id: z.string(), displayName: z.string() }).strict(),
  })
  .strict();
export const experienceDetailSchema = z
  .discriminatedUnion('isAnonymous', [anonymousExperienceSchema, namedExperienceSchema])
  .superRefine((experience, ctx) => {
    if (
      experience.status !== 'DRAFT' &&
      !experienceTemplateSchema.safeParse(experience.content).success
    )
      ctx.addIssue({ code: 'custom', path: ['content'], message: INVALID });
    if ((experience.status === 'PUBLISHED') !== (experience.publishedAt !== null))
      ctx.addIssue({ code: 'custom', path: ['publishedAt'], message: INVALID });
    if ((experience.status === 'REJECTED') !== (experience.moderationNote !== null))
      ctx.addIssue({ code: 'custom', path: ['moderationNote'], message: INVALID });
  });
export type ExperienceDetail = z.infer<typeof experienceDetailSchema>;
export const experiencePageSchema = z
  .object({ items: z.array(experienceDetailSchema), nextCursor: z.string().nullable() })
  .strict();
export type ExperiencePage = z.infer<typeof experiencePageSchema>;
/** Gönderme doğrudan yayınlayamaz; yayın/ret yalnız moderasyon kararının çıktısıdır. */
export const submitExperienceOutputSchema = z
  .object({ experienceId: z.string(), status: z.literal('PENDING') })
  .strict();
export type SubmitExperienceOutput = z.infer<typeof submitExperienceOutputSchema>;
export const reviewExperienceOutputSchema = z
  .object({ experienceId: z.string(), status: z.enum(['PUBLISHED', 'REJECTED']) })
  .strict();
export type ReviewExperienceOutput = z.infer<typeof reviewExperienceOutputSchema>;
export const reportExperienceOutputSchema = z
  .object({ reportId: z.string(), status: z.literal('OPEN') })
  .strict();
export type ReportExperienceOutput = z.infer<typeof reportExperienceOutputSchema>;
/** Şikâyet yanıtında raportör ve moderatör kimlikleri de bulunmaz. */
export const experienceReportSchema = z
  .object({
    id: z.string(),
    targetType: z.enum(REPORT_TARGET_TYPES),
    targetId: z.string(),
    reason: z.string(),
    status: z.enum(REPORT_STATUSES),
    reviewedAt: z.date().nullable(),
    resolutionNote: z.string().nullable(),
    createdAt: z.date(),
  })
  .strict();
export const experienceReportPageSchema = z
  .object({ items: z.array(experienceReportSchema), nextCursor: z.string().nullable() })
  .strict();
export type ExperienceReportPage = z.infer<typeof experienceReportPageSchema>;
export const resolveExperienceReportOutputSchema = z
  .object({ reportId: z.string(), status: z.enum(['RESOLVED', 'DISMISSED']) })
  .strict();
export type ResolveExperienceReportOutput = z.infer<typeof resolveExperienceReportOutputSchema>;

const authErrors = ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED', 'AUTH_NOT_VERIFIED'] as const;
export const EXPERIENCE_ACTION_ERRORS = {
  saveExperienceDraft: [
    ...authErrors,
    'AUTH_FORBIDDEN',
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'EXPERIENCE_NOT_EDITABLE',
  ],
  submitExperience: [
    ...authErrors,
    'AUTH_FORBIDDEN',
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'EXPERIENCE_INCOMPLETE',
    'EXPERIENCE_NOT_DRAFT',
  ],
  reviewExperience: [
    ...authErrors,
    'AUTH_FORBIDDEN',
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'EXPERIENCE_NOT_PENDING',
    'AUDIT_REASON_REQUIRED',
    'AUDIT_REASON_INVALID',
  ],
  reportExperience: [
    ...authErrors,
    'AUTH_FORBIDDEN',
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'EXPERIENCE_NOT_PUBLISHED',
    'REPORT_ALREADY_OPEN',
    'RATE_LIMITED',
  ],
  listMyExperiences: [...authErrors, 'VALIDATION_INVALID'],
  getExperienceDetail: [
    ...authErrors,
    'AUTH_FORBIDDEN',
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
  ],
  listModerationQueue: [...authErrors, 'AUTH_FORBIDDEN', 'VALIDATION_INVALID'],
  listExperienceReports: [...authErrors, 'AUTH_FORBIDDEN', 'VALIDATION_INVALID'],
  resolveExperienceReport: [
    ...authErrors,
    'AUTH_FORBIDDEN',
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'REPORT_NOT_OPEN',
    'AUDIT_REASON_REQUIRED',
    'AUDIT_REASON_INVALID',
  ],
} as const satisfies Record<string, readonly ErrorCode[]>;
