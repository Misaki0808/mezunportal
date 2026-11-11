import { z } from 'zod';

export const interviewQuerySchema = z
  .object({
    q: z.string().trim().max(100).default(''),
    companyId: z.string().trim().max(64).default(''),
    sectorId: z.string().trim().max(64).default(''),
    page: z
      .union([
        z.number(),
        z
          .string()
          .regex(/^[1-9]\d{0,4}$/)
          .transform(Number),
      ])
      .pipe(z.number().int().min(1).max(10000))
      .optional(),
  })
  .strict();
export type InterviewQuery = z.input<typeof interviewQuerySchema>;
export type InterviewFilters = z.output<typeof interviewQuerySchema>;
export const interviewQuestionBankSchema = z
  .object({
    companies: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    sectors: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    groups: z.array(
      z
        .object({
          companyId: z.string(),
          companyName: z.string(),
          companySlug: z.string(),
          sector: z.string().nullable(),
          questions: z.array(
            z
              .object({
                text: z.string(),
                count: z.number().int().min(3),
                category: z.enum(['QUESTION', 'PROCESS']),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    insufficient: z.boolean(),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  })
  .strict();
export type InterviewQuestionBank = z.infer<typeof interviewQuestionBankSchema>;
