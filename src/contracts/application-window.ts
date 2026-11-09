import { z } from 'zod';
const id = z.string().trim().min(1).max(64);
export const applicationScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('COMPANY'), id }).strict(),
  z.object({ kind: z.literal('SECTOR'), id }).strict(),
]);
export type ApplicationScope = z.infer<typeof applicationScopeSchema>;
export const applicationCalendarSchema = z
  .object({
    months: z.array(
      z.object({ month: z.number().int().min(1).max(12), count: z.number().int().min(3) }).strict(),
    ),
    isFollowing: z.boolean(),
    canFollow: z.boolean(),
  })
  .strict();
export type ApplicationCalendar = z.infer<typeof applicationCalendarSchema>;
export const applicationFollowSchema = z
  .object({ scope: applicationScopeSchema, following: z.boolean() })
  .strict();
export type ApplicationFollowInput = z.input<typeof applicationFollowSchema>;
