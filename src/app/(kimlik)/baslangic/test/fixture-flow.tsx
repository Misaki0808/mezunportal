'use client';

import {
  CONTACT_FIELDS,
  DEFAULT_FIELD_VISIBILITY,
  type FieldVisibilitySettings,
} from '@/contracts/privacy';
import {
  COMPLETION_FIELDS,
  ONBOARDING_STEPS,
  type OnboardingState,
  type SaveOnboardingStepInput,
  type SkipOnboardingStepInput,
} from '@/contracts/profile';
import type { ActionResult } from '@/contracts/result';
import { PROFILE_TAG_SEED } from '../../../../../prisma/seed-profile-tags';
import { OnboardingFlow } from '../onboarding-flow';

const initial: OnboardingState = {
  step: 'INTERESTS',
  steps: COMPLETION_FIELDS.map((step) => ({
    step,
    status: step === 'MEMBERSHIP' ? ('COMPLETED' as const) : ('PENDING' as const),
    skippable: step !== 'MEMBERSHIP',
    applicable: step !== 'MENTOR_PREFERENCE',
  })),
  interestTagIds: [],
  goalTagIds: [],
  mentorInterested: null,
  completion: { percent: 25, missing: ['INTERESTS', 'GOALS', 'VISIBILITY'] },
  studentMentorEligibility: { eligible: false, reason: 'EXPERIENCE_UNAVAILABLE' },
};
const fields: FieldVisibilitySettings = {
  fields: CONTACT_FIELDS.map((field) => ({
    field,
    level: DEFAULT_FIELD_VISIBILITY[field],
    isDefault: true,
  })),
};

/** Bu yanıtlar gerçek servis veya yetki kararı değildir; yalnız görünüm testinin verisidir. */
export function FixtureFlow({ requestedStep }: { requestedStep?: string }) {
  const step = ONBOARDING_STEPS.find((value) => value === requestedStep) ?? initial.step;
  async function save(input: SaveOnboardingStepInput): Promise<ActionResult<OnboardingState>> {
    if (input.step === 'INTERESTS')
      return { ok: true, data: { ...initial, step: 'GOALS', interestTagIds: input.tagIds } };
    if (input.step === 'GOALS')
      return { ok: true, data: { ...initial, step: 'VISIBILITY', goalTagIds: input.tagIds } };
    return { ok: true, data: { ...initial, step: 'COMPLETE' } };
  }
  async function skip(input: SkipOnboardingStepInput): Promise<ActionResult<OnboardingState>> {
    const next =
      input.step === 'INTERESTS'
        ? 'GOALS'
        : input.step === 'GOALS' || input.step === 'MENTOR_PREFERENCE'
          ? 'VISIBILITY'
          : 'COMPLETE';
    return { ok: true, data: { ...initial, step: next } };
  }
  return (
    <OnboardingFlow
      initialState={{
        ...initial,
        step,
        steps: initial.steps.map((item) =>
          item.step === 'MENTOR_PREFERENCE' && step === 'MENTOR_PREFERENCE'
            ? { ...item, applicable: true }
            : item,
        ),
        studentMentorEligibility:
          step === 'MENTOR_PREFERENCE'
            ? { eligible: true, reason: null }
            : initial.studentMentorEligibility,
      }}
      interests={PROFILE_TAG_SEED.filter((tag) => tag.kind === 'INTEREST').map((tag) => ({
        ...tag,
        id: tag.slug,
      }))}
      goals={PROFILE_TAG_SEED.filter((tag) => tag.kind === 'GOAL').map((tag) => ({
        ...tag,
        id: tag.slug,
      }))}
      save={save}
      skip={skip}
      initialVisibility={fields}
      saveVisibility={async () => ({ ok: true, data: fields })}
    />
  );
}
