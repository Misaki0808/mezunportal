import { describe, expect, it } from 'vitest';
import { feedbackInputSchema } from './feedback';

const yes = {
  appointmentId: 'a',
  happened: true,
  answers: ['POSITIVE', 'PARTIAL', 'NEGATIVE'],
  rating: 4.5,
  note: null,
};
describe('görüşme geri bildirim sözleşmesi', () => {
  it.each([0, 0.3, 1.3, 5.5])('%s puan yarım adım/sınır dışında reddedilir', (rating) => {
    expect(feedbackInputSchema.safeParse({ ...yes, rating }).success).toBe(false);
  });
  it.each([0.5, 1, 4.5, 5])('%s puan geçerli', (rating) => {
    expect(feedbackInputSchema.safeParse({ ...yes, rating }).success).toBe(true);
  });
  it('üç cevap ve puan gerçekleştiyse zorunlu; gerçekleşmediyse boş olmalı', () => {
    expect(
      feedbackInputSchema.safeParse({ ...yes, answers: ['POSITIVE', 'PARTIAL'] }).success,
    ).toBe(false);
    expect(
      feedbackInputSchema.safeParse({ ...yes, answers: ['POSITIVE', 'HACK', 'NEGATIVE'] }).success,
    ).toBe(false);
    expect(feedbackInputSchema.safeParse({ ...yes, rating: null }).success).toBe(false);
    expect(
      feedbackInputSchema.safeParse({ ...yes, happened: false, answers: null, rating: null })
        .success,
    ).toBe(true);
    expect(feedbackInputSchema.safeParse({ ...yes, happened: false }).success).toBe(false);
  });
});
