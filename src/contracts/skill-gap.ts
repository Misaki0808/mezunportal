import { z } from 'zod';
const id = z.string({ error: 'VALIDATION_INVALID' }).trim().min(1).max(64);
export const selectSkillGoalSchema = z.object({ titleId: id.nullable() }).strict();
export type SelectSkillGoalInput = z.input<typeof selectSkillGoalSchema>;
export const skillGapResultSchema = z
  .object({
    title: z.object({ id: z.string(), name: z.string() }).strict().nullable(),
    analysis: z
      .object({
        band: z.enum(['10+', '25+', '50+']),
        progress: z.number().int().min(0).max(100).multipleOf(5),
        missing: z
          .array(
            z
              .object({
                id: z.string(),
                label: z.string(),
                percent: z.number().int().min(0).max(100).multipleOf(5),
              })
              .strict(),
          )
          .max(10),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type SkillGapResult = z.infer<typeof skillGapResultSchema>;
export const skillGapTitlesSchema = z.array(
  z.object({ id: z.string(), name: z.string() }).strict(),
);
