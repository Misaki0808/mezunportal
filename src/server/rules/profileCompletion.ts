import {
  COMPLETION_FIELDS,
  type CompletionField,
  type MentorEligibility,
  type ProfileCompletion,
} from '@/contracts/profile';
import { isUpperClass, type ClassStanding } from './classYear';

/** Taslak: beş adım eşit ağırlıklı; ağırlık ve zorunluluklar PM doğrulaması bekler. */
export function computeProfileCompletion(
  completed: Readonly<Record<CompletionField, boolean>>,
): ProfileCompletion {
  const missing = COMPLETION_FIELDS.filter((field) => !completed[field]);
  return {
    percent: Math.round(
      ((COMPLETION_FIELDS.length - missing.length) / COMPLETION_FIELDS.length) * 100,
    ),
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
