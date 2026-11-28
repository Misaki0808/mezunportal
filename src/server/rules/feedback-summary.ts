import type { FeedbackAnswer } from '@/contracts/feedback';

/** Bireysel yanıtlar dışarı çıkmaz. Eski ve tamamlanmamış kayıtlar özetlenmez. */
export function mentorRating(values: readonly number[]) {
  if (values.length < 3) return null;
  return {
    average: values.reduce((sum, value) => sum + value, 0) / values.length / 2,
    count: values.length,
  };
}

export type StudentFeedback = {
  mentorId: string;
  answerOne: FeedbackAnswer;
  answerTwo: FeedbackAnswer;
  answerThree: FeedbackAnswer;
};

/** Talebi alan mentorun kendi yanıtları çıkarılır; en az iki BAŞKA mentor kalmalıdır. */
export function studentFeedbackSummary(rows: readonly StudentFeedback[], viewerId: string) {
  const others = rows.filter((row) => row.mentorId !== viewerId);
  if (new Set(others.map((row) => row.mentorId)).size < 2) return null;
  return {
    total: others.length,
    interested: others.filter((row) => row.answerOne === 'POSITIVE').length,
    prepared: others.filter((row) => row.answerTwo === 'POSITIVE').length > others.length / 2,
    punctual: others.filter((row) => row.answerThree === 'POSITIVE').length > others.length / 2,
  };
}
