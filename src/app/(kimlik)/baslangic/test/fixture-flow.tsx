'use client';

import {
  CONTACT_FIELDS,
  DEFAULT_FIELD_VISIBILITY,
  type FieldVisibilitySettings,
} from '@/contracts/privacy';
import {
  ONBOARDING_STEPS,
  type OnboardingState,
  type SaveOnboardingStepInput,
} from '@/contracts/profile';
import type { ActionResult } from '@/contracts/result';
import { PROFILE_TAG_SEED } from '../../../../../prisma/seed-profile-tags';
import { OnboardingFlow } from '../onboarding-flow';

const initial: OnboardingState = {
  step: 'INTERESTS',
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
  return (
    <OnboardingFlow
      initialState={{
        ...initial,
        step,
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
      initialVisibility={fields}
      saveVisibility={async () => ({ ok: true, data: fields })}
    />
  );
}
