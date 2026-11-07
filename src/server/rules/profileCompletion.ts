import {
  COMPLETION_FIELDS,
  ONBOARDING_STEPS,
  REQUIRED_STEPS,
  SKIPPABLE_STEPS,
  type CompletionField,
  type MentorEligibility,
  type OnboardingStepName,
  type ProfileCompletion,
  type SkippableStep,
  type StepStatus,
} from '@/contracts/profile';
import { isUpperClass, type ClassStanding } from './classYear';

/** Veritabanındaki iki ayrık liste (`Profile.completedSteps` / `skippedSteps`). */
export type StepLists = {
  completed: readonly CompletionField[];
  skipped: readonly CompletionField[];
};

/** Listelerden adım durumu: tamamlanan → COMPLETED, atlanan → SKIPPED, diğerleri PENDING. */
export function stepStatuses(lists: StepLists): Record<CompletionField, StepStatus> {
  const result = {} as Record<CompletionField, StepStatus>;
  for (const field of COMPLETION_FIELDS) {
    result[field] = lists.completed.includes(field)
      ? 'COMPLETED'
      : lists.skipped.includes(field)
        ? 'SKIPPED'
        : 'PENDING';
  }
  return result;
}

/**
 * Uygulanabilir adımların eşit ağırlıklı oranı. Açık olmayan mentor adımı paydaya ve eksiklere girmez;
 * SKIPPED ve PENDING eksik sayılır (atlama yüzdeyi artırmaz).
 */
export function computeProfileCompletion(
  statuses: Readonly<Record<CompletionField, StepStatus>>,
  options: { mentorStepAvailable: boolean },
): ProfileCompletion {
  const applicable = COMPLETION_FIELDS.filter(
    (field) => field !== 'MENTOR_PREFERENCE' || options.mentorStepAvailable,
  );
  const missing = applicable.filter((field) => statuses[field] !== 'COMPLETED');
  return {
    percent: Math.round(((applicable.length - missing.length) / applicable.length) * 100),
    missing,
  };
}

export function isSkippableStep(step: string): step is SkippableStep {
  return (SKIPPABLE_STEPS as readonly string[]).includes(step);
}

/** Kaydedilen adım COMPLETED olur (daha önce atlanmışsa atlanmışlardan çıkar). */
export function markCompleted(lists: StepLists, step: CompletionField): StepLists {
  return {
    completed: lists.completed.includes(step) ? lists.completed : [...lists.completed, step],
    skipped: lists.skipped.filter((item) => item !== step),
  };
}

/** Atlanan adım SKIPPED olur; yalnız durum değişir, adımın verisine dokunulmaz (çağıran silmez). */
export function markSkipped(lists: StepLists, step: SkippableStep): StepLists {
  return {
    completed: lists.completed.filter((item) => item !== step),
    skipped: lists.skipped.includes(step) ? lists.skipped : [...lists.skipped, step],
  };
}

/**
 * İlk girişi bitir: zorunlu adım COMPLETED değilse hata kodu; değilse kalan PENDING atlanabilir adımlar
 * SKIPPED olur (“hepsini atla”), COMPLETED/SKIPPED olanlar korunur.
 */
export function finishOnboarding(
  lists: StepLists,
): { ok: true; lists: StepLists } | { ok: false; errorCode: 'ONBOARDING_REQUIRED_STEP_PENDING' } {
  if (!REQUIRED_STEPS.every((step) => lists.completed.includes(step))) {
    return { ok: false, errorCode: 'ONBOARDING_REQUIRED_STEP_PENDING' };
  }
  const statuses = stepStatuses(lists);
  const pending = SKIPPABLE_STEPS.filter((step) => statuses[step] === 'PENDING');
  return {
    ok: true,
    lists: { completed: lists.completed, skipped: [...lists.skipped, ...pending] },
  };
}

/** Kaydet/atla sonrası ilerleme noktası: sıradaki adım (son adımdan sonra COMPLETE). */
export function nextOnboardingStep(step: OnboardingStepName): OnboardingStepName {
  const index = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[index + 1] ?? 'COMPLETE';
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
