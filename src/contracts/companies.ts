import { z } from 'zod';
import { mentorCardSchema } from './mentor-directory';
import { JOB_POSTING_KINDS } from './job-postings';

const id = z.uuid({ error: 'VALIDATION_INVALID' });
export const COMPANY_MIN_GROUP = 3;
export const searchCompaniesSchema = z
  .object({ q: z.string().trim().max(100).default('') })
  .strict();
export type SearchCompaniesInput = z.input<typeof searchCompaniesSchema>;
export const companySlugSchema = z.object({ slug: z.string().min(1).max(200) }).strict();
export type CompanySlugInput = z.input<typeof companySlugSchema>;
export const mergeCompaniesSchema = z
  .object({ sourceId: id, targetId: id })
  .strict()
  .refine((x) => x.sourceId !== x.targetId, { error: 'VALIDATION_INVALID' });
export type MergeCompaniesInput = z.input<typeof mergeCompaniesSchema>;
export const companySummarySchema = z
  .object({ id: id, slug: z.string(), name: z.string(), sector: z.string().nullable() })
  .strict();
export type CompanySummary = z.infer<typeof companySummarySchema>;
export const companiesPageSchema = z
  .object({ companies: z.array(companySummarySchema), popular: z.array(companySummarySchema) })
  .strict();
export type CompaniesPage = z.infer<typeof companiesPageSchema>;
export const companyDetailSchema = companySummarySchema
  .extend({
    experiences: z.array(
      z.discriminatedUnion('isAnonymous', [
        z
          .object({
            id: z.string(),
            type: z.string(),
            snippet: z.string(),
            isAnonymous: z.literal(true),
          })
          .strict(),
        z
          .object({
            id: z.string(),
            type: z.string(),
            snippet: z.string(),
            isAnonymous: z.literal(false),
            author: z.object({ id: z.string(), name: z.string() }).strict().nullable(),
          })
          .strict(),
      ]),
    ),
    alumni: z
      .object({
        current: z.number().int().min(COMPANY_MIN_GROUP).nullable(),
        former: z.number().int().min(COMPANY_MIN_GROUP).nullable(),
      })
      .strict(),
    periods: z.array(
      z
        .object({
          season: z.enum(['SPRING', 'SUMMER', 'AUTUMN', 'WINTER']),
          count: z.number().int().min(COMPANY_MIN_GROUP),
        })
        .strict(),
    ),
    mentors: z.array(mentorCardSchema),
    postings: z.array(
      z.object({ id: z.string(), title: z.string(), kind: z.enum(JOB_POSTING_KINDS) }).strict(),
    ),
  })
  .strict();
export type CompanyDetail = z.infer<typeof companyDetailSchema>;
export const companyMergeResultSchema = z
  .object({ targetId: id, alreadyMerged: z.boolean() })
  .strict();
export type CompanyMergeResult = z.infer<typeof companyMergeResultSchema>;
