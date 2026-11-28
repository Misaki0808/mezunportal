import { idTextSchema } from '@/lib/id-text';
import { userTextSchema } from '@/lib/user-text';
import { z } from 'zod';

export const FEEDBACK_ANSWERS = ['POSITIVE', 'PARTIAL', 'NEGATIVE'] as const;
export const feedbackAnswerSchema = z.enum(FEEDBACK_ANSWERS);
export type FeedbackAnswer = z.infer<typeof feedbackAnswerSchema>;
export const feedbackInputSchema = z
  .object({
    appointmentId: idTextSchema(),
    happened: z.boolean(),
    answers: z.tuple([feedbackAnswerSchema, feedbackAnswerSchema, feedbackAnswerSchema]).nullable(),
    rating: z.number().min(0.5).max(5).multipleOf(0.5).nullable(),
    note: userTextSchema(1, 1000).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.happened && !value.answers)
      ctx.addIssue({ code: 'custom', path: ['answers'], message: 'VALIDATION_INVALID' });
    if (value.happened && value.rating === null)
      ctx.addIssue({ code: 'custom', path: ['rating'], message: 'VALIDATION_INVALID' });
    if (!value.happened && (value.answers !== null || value.rating !== null))
      ctx.addIssue({ code: 'custom', path: ['happened'], message: 'VALIDATION_INVALID' });
  });
export type FeedbackInput = z.input<typeof feedbackInputSchema>;
export type FeedbackView = {
  appointmentId: string;
  counterpartName: string;
  startsAt: Date;
  endsAt: Date;
  role: 'MENTOR' | 'MENTEE';
  submitted: boolean;
};
