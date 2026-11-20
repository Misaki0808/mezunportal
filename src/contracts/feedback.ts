import { idTextSchema } from '@/lib/id-text';
import { userTextSchema } from '@/lib/user-text';
import { z } from 'zod';
export const feedbackInputSchema = z
  .object({
    appointmentId: idTextSchema(),
    happened: z.boolean(),
    helpful: z.boolean().nullable(),
    note: userTextSchema(1, 1000).nullable(),
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
