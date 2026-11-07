import {
  COMPLETION_FIELDS,
  type CompletionField,
  type MentorEligibility,
  type ProfileCompletion,
} from '@/contracts/profile';
import { isUpperClass, type ClassStanding } from './classYear';

/** Açık olmayan mentor adımı paydaya veya eksiklere girmez; atlanan açık adım eksik kalır. */
export function computeProfileCompletion(
  completed: Readonly<Record<CompletionField, boolean>>,
  options: { mentorStepAvailable: boolean },
): ProfileCompletion {
  const applicable = COMPLETION_FIELDS.filter(
    (field) => field !== 'MENTOR_PREFERENCE' || options.mentorStepAvailable,
  );
  const missing = applicable.filter((field) => !completed[field]);
  return {
    percent: Math.round(((applicable.length - missing.length) / applicable.length) * 100),
    missing,
  };
}

/** K-08: üçüncü sınıf ve üzeri + yayınlanmış deneyim. null, P1-07 verisinin henüz bulunmadığı anlamına gelir. */
export function studentMentorEligibility(
  standing: ClassStanding,
  publishedExperienceCount: number | null,
): MentorEligibility {
  if (!isUpperClass(standing)) return { eligible: false, reason: 'NOT_UPPER_CLASS' };
  if (publishedExperienceCount === null)
    return { eligible: false, reason: 'EXPERIENCE_UNAVAILABLE' };
  if (!Number.isInteger(publishedExperienceCount) || publishedExperienceCount < 1)
    return { eligible: false, reason: 'PUBLISHED_EXPERIENCE_REQUIRED' };
  return { eligible: true, reason: null };
}
