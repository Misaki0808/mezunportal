import { expect, it } from 'vitest';
import { mentorRating, studentFeedbackSummary } from './feedback-summary';

it('mentor ortalaması iki puanda gizli, üçte yarım puan üzerinden hesaplanır', () => {
  expect(mentorRating([10, 8])).toBeNull();
  expect(mentorRating([10, 8, 9])).toEqual({ average: 4.5, count: 3 });
});

it('öğrenci özeti iki farklı başka mentor ister ve kendi yanıtıyla çıkarımı engeller', () => {
  const row = (mentorId: string) => ({
    mentorId,
    answerOne: 'POSITIVE' as const,
    answerTwo: 'PARTIAL' as const,
    answerThree: 'POSITIVE' as const,
  });
  expect(studentFeedbackSummary([row('a'), row('a')], 'z')).toBeNull();
  expect(studentFeedbackSummary([row('a'), row('b')], 'a')).toBeNull();
  expect(studentFeedbackSummary([row('a'), row('b')], 'z')).toEqual({
    total: 2,
    interested: 2,
    prepared: false,
    punctual: true,
  });
});
