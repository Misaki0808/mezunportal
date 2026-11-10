import { z } from 'zod';

const id = z.string({ error: 'VALIDATION_INVALID' }).trim().min(1).max(64);
export const courseSelectionSchema = z
  .object({
    courseIds: z
      .array(id)
      .max(5)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
export const courseFilterSchema = z
  .object({
    semester: z.number().int().min(0).max(8).optional(),
    elective: z.boolean().optional(),
    query: z.string().trim().max(100).optional(),
  })
  .strict();
export const courseInputSchema = z
  .object({
    departmentId: id,
    code: z.string().trim().min(1).max(32),
    name: z.string().trim().min(1).max(200),
    semester: z.number().int().min(0).max(8),
    elective: z.boolean(),
  })
  .strict();
export type CourseSelectionInput = z.input<typeof courseSelectionSchema>;
export type CourseFilterInput = z.input<typeof courseFilterSchema>;
export type CourseInput = z.input<typeof courseInputSchema>;
export const saveCourseSchema = courseInputSchema.extend({ id: id.optional() }).strict();
export type SaveCourseInput = z.input<typeof saveCourseSchema>;
