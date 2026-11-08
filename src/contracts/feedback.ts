import { z } from 'zod';
export const feedbackInputSchema = z
  .object({
    appointmentId: z.string().trim().min(1).max(64),
    happened: z.boolean(),
    helpful: z.boolean().nullable(),
    note: z.string().trim().min(1).max(1000).nullable(),
  })
  .strict()
  .refine((value) => value.happened || value.helpful === null);
export type FeedbackInput = z.input<typeof feedbackInputSchema>;
export type FeedbackView = {
  appointmentId: string;
  counterpartName: string;
  startsAt: Date;
  endsAt: Date;
  role: 'MENTOR' | 'MENTEE';
  submitted: boolean;
};
